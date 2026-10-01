'use server'

import { revalidatePath } from 'next/cache'
import { openOptional, sealOptional } from '@/core/crypto/fields'
import { alert } from '@/core/alerts'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { deriveShortCode } from './instructor'

export interface ActionState {
  error: string | null
  ok?: boolean
  message?: string
  /** The row just created, so the form can go to its page next. */
  createdId?: string
}

/** Store blank optional form values as null. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()

const instructorSchema = z.object({
  fullName: z.string().trim().min(1, 'A name is required'),
  danceStyle: z.string().trim().min(1, 'A class or style is required'),
  shortCode: optionalText,
  email: z.union([z.literal(''), z.string().trim().email('That is not an email address')]).transform((v) => v || null),
  phone: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  bankName: optionalText,
  bankAccountNo: optionalText,
  engagement: z.enum(['CONTRACTED', 'GUEST']),
  contractRef: optionalText,
})

function readForm(formData: FormData) {
  return instructorSchema.safeParse({
    fullName: formData.get('fullName') ?? '',
    danceStyle: formData.get('danceStyle') ?? '',
    shortCode: formData.get('shortCode') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    addressLine1: formData.get('addressLine1') ?? '',
    addressLine2: formData.get('addressLine2') ?? '',
    postalCode: formData.get('postalCode') ?? '',
    bankName: formData.get('bankName') ?? '',
    bankAccountNo: formData.get('bankAccountNo') ?? '',
    engagement: formData.get('engagement') ?? 'CONTRACTED',
    contractRef: formData.get('contractRef') ?? '',
  })
}

export async function saveInstructor(
  orgSlug: string,
  instructorId: string | null,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'instructor.manage')

  const parsed = readForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Those details are not valid' }
  }

  const plainBank = parsed.data.bankAccountNo ?? null
  const data = {
    ...parsed.data,
    shortCode: parsed.data.shortCode ?? deriveShortCode(parsed.data.fullName),
    bankAccountNo: sealOptional(plainBank),
  }
  let bankChanged = false

  let createdId: string | undefined
  const missing = await dbAs(userId, async (tx) => {
    if (instructorId) {
      const before = await tx.instructor.findFirst({ where: { id: instructorId, orgId: org.id } })
      if (!before) return true

      const plainBefore = openOptional(before.bankAccountNo)
      bankChanged = plainBefore !== plainBank || (before.bankName ?? null) !== (parsed.data.bankName ?? null)
      const after = await tx.instructor.update({ where: { id: before.id }, data })
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'instructor.update',
          targetType: 'Instructor',
          targetId: before.id,
          before: redactBank({ ...before, bankAccountNo: plainBefore }),
          after: redactBank({ ...after, bankAccountNo: plainBank }),
        },
        tx
      )
    } else {
      const created = await tx.instructor.create({ data: { ...data, orgId: org.id } })
      createdId = created.id
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'instructor.create',
          targetType: 'Instructor',
          targetId: created.id,
          after: redactBank({ ...created, bankAccountNo: plainBank }),
        },
        tx
      )
    }
    return false
  })

  if (missing) return { error: 'That coach no longer exists' }

  // Changing where a coach's money goes is the classic invoice fraud. It is
  // allowed, it is audited, and somebody hears about it straight away.
  if (bankChanged) await alert('bank_details_changed', { coach: data.fullName, club: org.slug })

  revalidatePath(`/${orgSlug}/instructors`)
  return { error: null, ok: true, createdId }
}

const rateSchema = z.object({
  // Typed in dollars because that is what the contract says; stored in cents
  // because every downstream total is integer arithmetic.
  hourlyRate: z.coerce.number().positive('A rate has to be more than zero'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A start date is required'),
  note: optionalText,
})

/**
 * Add a rate, effective from a date.
 *
 * Never an edit of the existing row. A past invoice has to keep the rate it
 * was raised at, so a rise is a new row with a later effectiveFrom and
 * resolveRate() picks whichever one covers the session being billed.
 */
export async function addInstructorRate(
  orgSlug: string,
  instructorId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'instructor.manage')

  const parsed = rateSchema.safeParse({
    hourlyRate: formData.get('hourlyRate') ?? '',
    effectiveFrom: formData.get('effectiveFrom') ?? '',
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That rate is not valid' }
  }

  const effectiveFrom = new Date(`${parsed.data.effectiveFrom}T00:00:00Z`)
  // Rounded, not truncated: 90.005 typed into a dollar field should not
  // silently become $90.00 and under-bill every session for a year.
  const hourlyRateCents = Math.round(parsed.data.hourlyRate * 100)

  const problem = await dbAs(userId, async (tx) => {
    const instructor = await tx.instructor.findFirst({
      where: { id: instructorId, orgId: org.id },
      select: { id: true },
    })
    if (!instructor) return 'That coach no longer exists'

    const existing = await tx.instructorRate.findUnique({
      where: { instructorId_effectiveFrom: { instructorId: instructor.id, effectiveFrom } },
      select: { id: true },
    })
    if (existing) {
      return 'A rate already starts on that date. Pick a different start date.'
    }

    const created = await tx.instructorRate.create({
      data: {
        orgId: org.id,
        instructorId: instructor.id,
        hourlyRateCents,
        effectiveFrom,
        note: parsed.data.note,
      },
    })

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'instructor.rate_add',
        targetType: 'InstructorRate',
        targetId: created.id,
        after: { hourlyRateCents, effectiveFrom: effectiveFrom.toISOString(), instructorId: instructor.id },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/instructors/${instructorId}`)
  return { error: null, ok: true }
}

/**
 * The audit log records what changed, and it is readable by every exco member.
 *
 * A bank account number belongs on the invoice that pays the coach, not in a
 * change history that a dozen people can scroll. The last four digits are
 * enough to see that the field changed and which way.
 */
function redactBank<T extends { bankAccountNo?: string | null }>(row: T): Record<string, unknown> {
  const { bankAccountNo, ...rest } = row
  return {
    ...rest,
    bankAccountNo: bankAccountNo ? `••••${bankAccountNo.slice(-4)}` : null,
  }
}

const sessionSchema = z.object({
  // Blank is a real answer, not a missing one: it means the club met and
  // nobody was paid to teach. See ClassSession.instructorId.
  instructorId: optionalText,
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is required'),
  // 15 minutes is below any real class; 8 hours is above any real class and
  // is what a mistyped "600" for 60 looks like.
  durationMinutes: z.coerce
    .number()
    .int('Minutes have to be a whole number')
    .min(15, 'A class is at least 15 minutes')
    .max(480, 'That is longer than a class — check the minutes'),
  notes: optionalText,
})

/** Create or update the session that drives both claim documents. */
export async function saveSession(
  orgSlug: string,
  sessionId: string | null,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'session.manage')

  const parsed = sessionSchema.safeParse({
    instructorId: formData.get('instructorId') ?? '',
    heldOn: formData.get('heldOn') ?? '',
    durationMinutes: formData.get('durationMinutes') ?? '',
    notes: formData.get('notes') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Those details are not valid' }
  }

  // Midnight UTC. heldOn is a DATE column and the whole month's arithmetic
  // compares these to each other, so a local-midnight value in Singapore
  // would land on the previous day once Postgres dropped the time.
  const heldOn = new Date(`${parsed.data.heldOn}T00:00:00Z`)
  const data = {
    instructorId: parsed.data.instructorId,
    heldOn,
    durationMinutes: parsed.data.durationMinutes,
    notes: parsed.data.notes,
  }

  let createdId: string | undefined
  const problem = await dbAs(userId, async (tx) => {
    if (parsed.data.instructorId) {
      const instructor = await tx.instructor.findFirst({
        where: { id: parsed.data.instructorId, orgId: org.id },
        select: { id: true },
      })
      if (!instructor) return 'That coach is not on this club’s list'
    }

    // @@unique([orgId, instructorId, heldOn]), plus the partial index that
    // covers self-practice. Caught here so the message is a sentence rather
    // than a constraint name, and because the honest fix is usually to edit
    // the existing session rather than add a second one.
    const clash = await tx.classSession.findFirst({
      where: {
        orgId: org.id,
        instructorId: parsed.data.instructorId,
        heldOn,
        ...(sessionId ? { NOT: { id: sessionId } } : {}),
      },
      select: { id: true },
    })
    if (clash) {
      return parsed.data.instructorId
        ? 'That coach already has a class recorded on that date. Edit it instead of adding a second one.'
        : 'A self-practice session is already recorded on that date.'
    }

    if (sessionId) {
      const before = await tx.classSession.findFirst({
        where: { id: sessionId, orgId: org.id },
      })
      if (!before) return 'That class no longer exists'

      // Same rule as deleting. Editing a raised month is worse, if anything:
      // a deletion at least leaves an obvious hole, while a changed duration
      // silently makes a submitted invoice stop following from the register.
      // Both months, not just the one it is in now. Moving a class into a
      // raised month adds a line to a document already with the Office of
      // Finance just as surely as moving one out removes one.
      const raised =
        (await raisedMonthFor(tx, org.id, before)) ??
        (await raisedMonthFor(tx, org.id, { instructorId: data.instructorId, heldOn }))
      if (raised) return raised

      const after = await tx.classSession.update({ where: { id: before.id }, data })
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'session.update',
          targetType: 'ClassSession',
          targetId: before.id,
          before: { heldOn: before.heldOn.toISOString(), durationMinutes: before.durationMinutes, instructorId: before.instructorId },
          after: { heldOn: after.heldOn.toISOString(), durationMinutes: after.durationMinutes, instructorId: after.instructorId },
        },
        tx
      )
    } else {
      // A new class in a month that has already been raised is the same
      // problem from the other end: the invoice keeps the total it was issued
      // with, while the document rebuilt for download grows a line.
      const raised = await raisedMonthFor(tx, org.id, {
        instructorId: data.instructorId,
        heldOn,
      })
      if (raised) return raised

      const created = await tx.classSession.create({ data: { ...data, orgId: org.id } })
      createdId = created.id
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'session.create',
          targetType: 'ClassSession',
          targetId: created.id,
          after: { heldOn: created.heldOn.toISOString(), durationMinutes: created.durationMinutes, instructorId: created.instructorId },
        },
        tx
      )
    }
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/sessions`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true, createdId }
}

/**
 * Remove a class.
 *
 * Refused once the month has been invoiced: the invoice lines point at these
 * rows, and deleting one would leave a document whose total no longer follows
 * from anything in the database.
 */
export async function deleteSession(
  orgSlug: string,
  sessionId: string
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'session.manage')

  const problem = await dbAs(userId, async (tx) => {
    const session = await tx.classSession.findFirst({
      where: { id: sessionId, orgId: org.id },
      // Lines on a voided invoice do not hold the class: voiding is exactly
      // how a month with a wrong class in it gets corrected.
      include: { invoiceLines: { where: { invoice: { status: { not: 'VOID' } } }, select: { id: true } } },
    })
    if (!session) return 'That class no longer exists'

    // Two checks, because either one alone has a hole. The line link is the
    // precise answer — this exact class is on that invoice — but a line whose
    // link was never written, or was cleared, would pass it. The month check
    // catches that: if the coach's month has been raised at all, none of its
    // classes may move, because the totals on a submitted document are
    // derived from all of them.
    if (session.invoiceLines.length > 0) {
      return 'That class is already on an invoice. Void the invoice before changing it.'
    }

    const raised = await raisedMonthFor(tx, org.id, session)
    if (raised) return raised

    await tx.classSession.delete({ where: { id: session.id } })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'session.delete',
        targetType: 'ClassSession',
        targetId: session.id,
        before: {
          heldOn: session.heldOn.toISOString(),
          durationMinutes: session.durationMinutes,
          instructorId: session.instructorId,
        },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/sessions`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/** Replace the whole attendance register, recording both presence and absence. */
export async function setAttendance(
  orgSlug: string,
  sessionId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'session.manage')

  const present = new Set(formData.getAll('present').map(String))

  const problem = await dbAs(userId, async (tx) => {
    const session = await tx.classSession.findFirst({
      where: { id: sessionId, orgId: org.id },
      select: { id: true, instructorId: true, heldOn: true },
    })
    if (!session) return 'That class no longer exists'

    // Marking attendance changes the grid on the month's attendance sheet,
    // which is the evidence the invoice rests on. Once that sheet has been
    // raised it has gone out; re-marking it here would leave the portal and
    // the Office of Finance holding different documents.
    const raised = await raisedMonthFor(tx, org.id, session)
    if (raised) return raised

    // The roster, and anybody already marked for this class who has left
    // since — the same people the register shows — so a wrong mark on a
    // departed member can be cleared.
    const members = await tx.member.findMany({
      where: {
        orgId: org.id,
        OR: [{ isActive: true }, { attendance: { some: { sessionId: session.id } } }],
      },
      select: { id: true },
    })

    // A member id in the form that is not on the roster is dropped rather
    // than written: the form is client input, and the roster is the authority
    // on who could have been in the room.
    const roster = new Set(members.map((m) => m.id))
    for (const id of present) {
      if (!roster.has(id)) present.delete(id)
    }

    for (const member of members) {
      await tx.sessionAttendance.upsert({
        where: { sessionId_memberId: { sessionId: session.id, memberId: member.id } },
        update: { present: present.has(member.id), recordedById: userId, recordedAt: new Date() },
        create: {
          orgId: org.id,
          sessionId: session.id,
          memberId: member.id,
          present: present.has(member.id),
          recordedById: userId,
        },
      })
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'session.attendance',
        targetType: 'ClassSession',
        targetId: session.id,
        after: { presentCount: present.size, rosterCount: members.length },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/sessions/${sessionId}`)
  revalidatePath(`/${orgSlug}/sessions`)
  return { error: null, ok: true }
}

/**
 * Refuse to move a class out from under a document that has already been
 * raised, and say which document.
 *
 * For a coach-led class that is their own month. For a self-practice class it
 * is *any* coach's month, because a self-practice date prints on every
 * attendance sheet for that month with the instructor row reading NO —
 * removing it would change a sheet that has already gone to the Office of
 * Finance, and the sheet is the evidence the invoice rests on.
 */
async function raisedMonthFor(
  tx: Prisma.TransactionClient,
  orgId: string,
  session: { instructorId: string | null; heldOn: Date }
): Promise<string | null> {
  const raised = await tx.invoice.findFirst({
    where: {
      orgId,
      ...(session.instructorId ? { instructorId: session.instructorId } : {}),
      periodYear: session.heldOn.getUTCFullYear(),
      periodMonth: session.heldOn.getUTCMonth() + 1,
      status: { not: 'VOID' },
    },
    select: { id: true },
  })
  if (!raised) return null

  return session.instructorId
    ? 'That month has already been raised for this coach. Void the invoice before changing its classes.'
    : 'That month has already been raised. A self-practice date appears on every attendance sheet for the month, so voiding the invoice comes first.'
}
