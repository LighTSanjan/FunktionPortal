'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { deriveShortCode } from './instructor'

export interface ActionState {
  error: string | null
  ok?: boolean
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

  const data = {
    ...parsed.data,
    shortCode: parsed.data.shortCode ?? deriveShortCode(parsed.data.fullName),
  }

  const missing = await dbAs(userId, async (tx) => {
    if (instructorId) {
      const before = await tx.instructor.findFirst({ where: { id: instructorId, orgId: org.id } })
      if (!before) return true

      const after = await tx.instructor.update({ where: { id: before.id }, data })
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'instructor.update',
          targetType: 'Instructor',
          targetId: before.id,
          before: redactBank(before),
          after: redactBank(after),
        },
        tx
      )
    } else {
      const created = await tx.instructor.create({ data: { ...data, orgId: org.id } })
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'instructor.create',
          targetType: 'Instructor',
          targetId: created.id,
          after: redactBank(created),
        },
        tx
      )
    }
    return false
  })

  if (missing) return { error: 'That instructor no longer exists' }

  revalidatePath(`/${orgSlug}/instructors`)
  return { error: null, ok: true }
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
    if (!instructor) return 'That instructor no longer exists'

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

// ─────────────────────────────────────────────
// Class sessions
// ─────────────────────────────────────────────

const sessionSchema = z.object({
  instructorId: z.string().min(1, 'Pick who taught the class'),
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

  const problem = await dbAs(userId, async (tx) => {
    const instructor = await tx.instructor.findFirst({
      where: { id: parsed.data.instructorId, orgId: org.id },
      select: { id: true },
    })
    if (!instructor) return 'That coach is not on this club’s list'

    // @@unique([orgId, instructorId, heldOn]). Caught here so the message is
    // a sentence rather than a constraint name, and because the honest fix is
    // usually to edit the existing session rather than add a second one.
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
      return 'That coach already has a class recorded on that date. Edit it instead of adding a second one.'
    }

    if (sessionId) {
      const before = await tx.classSession.findFirst({
        where: { id: sessionId, orgId: org.id },
      })
      if (!before) return 'That class no longer exists'

      // Same rule as deleting. Editing a raised month is worse, if anything:
      // a deletion at least leaves an obvious hole, while a changed duration
      // silently makes a submitted invoice stop following from the register.
      const raised = await tx.invoice.findFirst({
        where: {
          orgId: org.id,
          instructorId: before.instructorId,
          periodYear: before.heldOn.getUTCFullYear(),
          periodMonth: before.heldOn.getUTCMonth() + 1,
          status: { not: 'VOID' },
        },
        select: { id: true },
      })
      if (raised) {
        return 'That month has already been raised for this coach. Void the invoice before changing its classes.'
      }

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
      const created = await tx.classSession.create({ data: { ...data, orgId: org.id } })
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
  return { error: null, ok: true }
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
      include: { invoiceLines: { select: { id: true } } },
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

    const raised = await tx.invoice.findFirst({
      where: {
        orgId: org.id,
        instructorId: session.instructorId,
        periodYear: session.heldOn.getUTCFullYear(),
        periodMonth: session.heldOn.getUTCMonth() + 1,
        status: { not: 'VOID' },
      },
      select: { id: true },
    })
    if (raised) {
      return 'That month has already been raised for this coach. Void the invoice before changing its classes.'
    }

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
      select: { id: true },
    })
    if (!session) return 'That class no longer exists'

    const members = await tx.member.findMany({
      where: { orgId: org.id, isActive: true },
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
