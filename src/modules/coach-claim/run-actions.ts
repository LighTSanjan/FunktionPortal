'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { allocateReference } from '@/modules/references'
import { financialYearOf } from '@/modules/references/format'
import { buildClaim, buildClaimContext, localDateKey } from './monthly-run'
import { captureSnapshot, snapshotForStorage } from './snapshot'
import { toInvoiceData } from './claim'
import { addWorkingDays, OSL_SUBMISSION_WORKING_DAYS } from './deadlines'
import { toDateColumn } from '@/lib/date-only'
import type { ActionState } from './actions'

const generateSchema = z.object({
  instructorId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Pick a month'),
  fundSource: z.enum(['SEED', 'INCOME']),
})

/** Persist a coach's month and allocate its reference in one transaction. */
export async function generateMonthlyDocuments(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')
  const { name: treasurerName } = await verifySession()

  const parsed = generateSchema.safeParse({
    instructorId: formData.get('instructorId') ?? '',
    period: formData.get('period') ?? '',
    fundSource: formData.get('fundSource') ?? 'SEED',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That is not a valid request' }
  }

  const [periodYear, periodMonth] = parsed.data.period.split('-').map(Number)

  const problem = await dbAs(userId, async (tx) => {
    const settled = await tx.coachMonthSettlement.findUnique({
      where: { orgId_periodYear_periodMonth: { orgId: org.id, periodYear, periodMonth } },
      select: { id: true },
    })
    if (settled) {
      // A number spent here is a gap in the series OSL will ask about, for a
      // document that already exists on paper.
      return 'That month is marked as paid outside the portal. Undo that first if it really needs raising here.'
    }

    // A voided one does not count: it keeps its reference number — the gap in
    // the series is the audit trail — and the replacement is a new row with a
    // new number. Only one live document per coach per month, which a partial
    // unique index holds in the database as well.
    const existing = await tx.invoice.findFirst({
      where: {
        orgId: org.id,
        instructorId: parsed.data.instructorId,
        periodYear,
        periodMonth,
        status: { not: 'VOID' },
      },
      select: { id: true },
    })
    if (existing) {
      return 'That month is already raised for this coach. Open it, or void it first.'
    }

    const context = await buildClaimContext(tx, {
      orgId: org.id,
      orgName: org.name,
      instructorId: parsed.data.instructorId,
      periodYear,
      periodMonth,
      fundSource: parsed.data.fundSource,
      // Placeholder: buildClaim does not read it, and the real one is
      // allocated below once the claim is known to be billable. Allocating
      // before that would burn a number on a coach who taught nothing.
      referenceNumber: 'PENDING',
      treasurerName,
    })
    if (!context) return 'That coach is no longer on the list'

    let claim
    try {
      claim = buildClaim(context.input)
    } catch (error) {
      return error instanceof Error ? error.message : 'That month could not be assembled'
    }
    if (!claim.hasBillableSessions) {
      return 'No classes are recorded for that coach in that month.'
    }

    // Throws for a missing bank account or rate. Checked before the number is
    // allocated, for the same reason.
    try {
      toInvoiceData({ ...context.input, referenceNumber: 'PENDING' }, claim)
    } catch (error) {
      return error instanceof Error ? error.message : 'That coach cannot be invoiced yet'
    }

    const settings = await tx.organisationSettings.findUnique({
      where: { orgId: org.id },
      select: { projectCode: true, institutionShortName: true },
    })

    const reference = await allocateReference(tx, {
      orgId: org.id,
      series: 'IV',
      financialYear: financialYearOf(claim.invoiceDate),
      projectCode: settings?.projectCode ?? '097',
    })

    const presentByDate: Record<string, number> = {}
    for (const session of claim.sessions) {
      presentByDate[session.heldOn.toISOString().slice(0, 10)] = session.presentCount
    }

    const sheet = await tx.attendanceSheet.create({
      data: {
        orgId: org.id,
        instructorId: parsed.data.instructorId,
        periodYear,
        periodMonth,
        totalPresentByDate: presentByDate,
        coachClaimCents: claim.totalCents,
        clubFundBalanceCents: context.input.clubFundBalanceCents ?? null,
        // The month as it stands, now. Everything behind it keeps moving —
        // rates get backdated, members join the roster, a coach changes bank
        // account — and the copy the Office of Finance receives does not.
        snapshot: snapshotForStorage(captureSnapshot({
          organisationName: context.input.organisationName,
          institutionShortName: settings?.institutionShortName ?? undefined,
          instructor: context.input.instructor,
          billTo: context.input.billTo,
          branding: context.input.branding,
          roster: context.input.roster,
          sessions: claim.sessions,
          clubFundBalanceCents: context.input.clubFundBalanceCents,
        })) as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      },
      select: { id: true },
    })

    const submissionDueAt = addWorkingDays(claim.invoiceDate, OSL_SUBMISSION_WORKING_DAYS)

    const invoice = await tx.invoice.create({
      data: {
        orgId: org.id,
        instructorId: parsed.data.instructorId,
        referenceNumberId: reference.id,
        attendanceSheetId: sheet.id,
        documentNo: claim.documentNo,
        periodYear,
        periodMonth,
        invoiceDate: toDateColumn(claim.invoiceDate),
        fundSource: parsed.data.fundSource,
        subtotalCents: claim.subtotalCents,
        gstCents: claim.gstCents,
        totalCents: claim.totalCents,
        status: 'GENERATED',
        generatedAt: new Date(),
        submissionDueAt,
        lines: {
          create: claim.lines.map((line, index) => ({
            // The class this line bills. Nullable in the schema because a
            // line can outlive its session, but it is always set here — it is
            // what makes an invoice traceable back to the register.
            sessionId: context.sessionIdByDate.get(localDateKey(line.heldOn)) ?? null,
            // The date is a field as well as part of the description, because
            // the document is rebuilt from these rows rather than from the
            // classes they came out of.
            heldOn: toDateColumn(line.heldOn),
            description: `${context.input.instructor.danceStyle} class, ${localDateKey(
              line.heldOn
            )}`,
            minutes: line.durationMinutes,
            rateCents: line.hourlyRateCents,
            amountCents: line.amountCents,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    })

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'claim.generate',
        targetType: 'Invoice',
        targetId: invoice.id,
        after: {
          referenceNumber: reference.formatted,
          documentNo: claim.documentNo,
          periodYear,
          periodMonth,
          instructorId: parsed.data.instructorId,
          fundSource: parsed.data.fundSource,
          totalCents: claim.totalCents,
          sessionCount: claim.lines.length,
        },
      },
      tx
    )

    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/monthly-run`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/**
 * Verify the attendance sheet and countersign the invoice, in one act.
 *
 * They are one act because they are one attestation by one person: §3.3 has
 * the Treasurer verify the sheet, and §3.1.2 has the club countersign the
 * coach's invoice with the same name and post. Signing them separately would
 * let the two documents disagree about who stood behind the month.
 *
 * The stamp is applied here, in the request that authorises it, from the
 * signatory's own specimen. The specimen's key is recorded on the sheet so
 * that re-rendering the document years later reproduces what was actually
 * signed rather than whatever the signatory has on file by then.
 */
export async function signMonth(orgSlug: string, invoiceId: string): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')

  const problem = await dbAs(userId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id },
      select: {
        id: true,
        status: true,
        attendanceSheetId: true,
        attendanceSheet: {
          select: { verifiedAt: true, verifiedBy: { select: { name: true } } },
        },
      },
    })
    if (!invoice) return 'That month no longer exists'
    if (invoice.status === 'VOID') return 'That month is void'
    if (!invoice.attendanceSheetId) {
      return 'That month has no attendance sheet to verify.'
    }
    if (invoice.attendanceSheet?.verifiedAt) {
      const who = invoice.attendanceSheet.verifiedBy?.name ?? 'somebody'
      return `Already verified by ${who}. Withdraw that first if it needs signing again.`
    }

    const [user, membership] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: { name: true, signatureImagePath: true },
      }),
      tx.organisationMembership.findUnique({
        where: { userId_orgId: { userId, orgId: org.id } },
        select: { office: true },
      }),
    ])

    const signedAt = new Date()
    // Conditional on the sheet still being unsigned, and the row count is
    // checked. Two exco members opening the same month both read verifiedAt
    // as null a moment ago; an unconditional update would let the second
    // quietly replace the first person's name, post, specimen and timestamp
    // while both were told it worked.
    const claimed = await tx.attendanceSheet.updateMany({
      where: { id: invoice.attendanceSheetId, verifiedAt: null },
      data: {
        verifiedByUserId: userId,
        // Name and post are captured now rather than dereferenced at render
        // time. A treasurer who hands over in March signed as treasurer in
        // February, and a profile rename must not re-attribute a document
        // already with the Office of Finance.
        verifiedByName: user?.name ?? '',
        // Null where they hold no post. Writing TREASURER for an exco member
        // who has not been given the office would print a post nobody granted
        // on the one line that says who stood behind the month.
        verifiedAsOffice: membership?.office ?? null,
        verifiedAt: signedAt,
        signatureImagePath: user?.signatureImagePath ?? null,
      },
    })
    if (claimed.count !== 1) {
      return 'Somebody else signed that month a moment ago. Reload to see who.'
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'SIGNED', signedAt },
    })

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'claim.sign',
        targetType: 'Invoice',
        targetId: invoice.id,
        before: { status: invoice.status },
        after: {
          status: 'SIGNED',
          office: membership?.office ?? 'TREASURER',
          stamped: Boolean(user?.signatureImagePath),
        },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/monthly-run`)
  revalidatePath(`/${orgSlug}/monthly-run/${invoiceId}`)
  return { error: null, ok: true }
}

const voidSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Say why it is being voided. The reason stays with its reference number.')
    .max(300, 'Keep the reason short'),
})

/**
 * Void a raised month so it can be raised again.
 *
 * For a month raised with a mistake in it — a wrong class, a wrong fund, a
 * coach's changed bank details. The invoice and its attendance sheet stop
 * counting, the classes under them can be corrected, and the month goes back
 * to "Ready to raise" with a fresh reference number. The old number stays
 * issued with the reason beside it, so the gap in the series answers itself.
 *
 * A month already sent to OSL can be voided — OSL do send them back — but the
 * portal cannot tell OSL, so the confirmation says to. A month recorded as
 * paid cannot: money moved against it. Take the payment back first.
 */
export async function voidMonth(
  orgSlug: string,
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')

  const parsed = voidSchema.safeParse({ reason: formData.get('reason') ?? '' })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Say why it is being voided' }

  let back: string | null = null
  const problem = await dbAs(userId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id },
      select: {
        id: true,
        status: true,
        periodYear: true,
        periodMonth: true,
        attendanceSheetId: true,
        referenceNumberId: true,
        submittedToOslAt: true,
        referenceNumber: { select: { formatted: true } },
      },
    })
    if (!invoice) return 'That month no longer exists'
    if (invoice.status === 'VOID') return 'That month is already void.'
    if (invoice.status === 'PAID') {
      return 'That month is recorded as paid. Take the payment back first — money moved against it.'
    }

    const voidedAt = new Date()
    // Conditional on still being live, so two people voiding at once cannot
    // both be told they did it.
    const claimed = await tx.invoice.updateMany({
      where: { id: invoice.id, status: { not: 'VOID' } },
      data: { status: 'VOID', voidedAt },
    })
    if (claimed.count !== 1) return 'Somebody else changed that month a moment ago. Reload to see it.'

    if (invoice.attendanceSheetId) {
      await tx.attendanceSheet.update({ where: { id: invoice.attendanceSheetId }, data: { voidedAt } })
    }
    if (invoice.referenceNumberId) {
      await tx.referenceNumber.update({
        where: { id: invoice.referenceNumberId },
        data: { voidedAt, voidReason: parsed.data.reason },
      })
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'claim.void',
        targetType: 'Invoice',
        targetId: invoice.id,
        before: { status: invoice.status, sentToOsl: invoice.submittedToOslAt !== null },
        after: { status: 'VOID', reference: invoice.referenceNumber?.formatted ?? null, reason: parsed.data.reason },
      },
      tx
    )
    back = `${invoice.periodYear}-${String(invoice.periodMonth).padStart(2, '0')}`
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/monthly-run`)
  revalidatePath(`/${orgSlug}/monthly-run/${invoiceId}`)
  revalidatePath(`/${orgSlug}/dashboard`)
  revalidatePath(`/${orgSlug}/sessions`)
  return { error: null, ok: true, message: back ?? undefined }
}

/**
 * Take the signature back off, for a month that was signed before somebody
 * spotted a wrong class on it.
 *
 * Refused once the pack has gone to the Office of Finance: at that point the
 * signed document exists outside the portal and un-signing the copy here would
 * only make the two disagree. Correcting a submitted month means voiding it.
 */
export async function withdrawSignature(
  orgSlug: string,
  invoiceId: string
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')

  const problem = await dbAs(userId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id },
      select: {
        id: true,
        status: true,
        attendanceSheetId: true,
        submittedToOslAt: true,
        attendanceSheet: { select: { verifiedByName: true } },
      },
    })
    if (!invoice) return 'That month no longer exists'
    if (invoice.submittedToOslAt) {
      return 'That month has already been sent. Void it rather than un-signing it.'
    }
    if (invoice.status !== 'SIGNED' || !invoice.attendanceSheetId) return null
    const signedBy = invoice.attendanceSheet

    await tx.attendanceSheet.update({
      where: { id: invoice.attendanceSheetId },
      data: {
        verifiedByUserId: null,
        verifiedByName: null,
        verifiedAsOffice: null,
        verifiedAt: null,
        signatureImagePath: null,
      },
    })
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'GENERATED', signedAt: null },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'claim.unsign',
        targetType: 'Invoice',
        targetId: invoice.id,
        // Whose signature came off, not just that one did. Any exco member
        // may withdraw one — the office is a label, not a permission — so the
        // log has to answer "who removed whose".
        before: { status: 'SIGNED', signedBy: signedBy?.verifiedByName ?? null },
        after: { status: 'GENERATED' },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/monthly-run`)
  revalidatePath(`/${orgSlug}/monthly-run/${invoiceId}`)
  return { error: null, ok: true }
}

/** Mark the month as sent to OSL. */
export async function markSubmitted(orgSlug: string, invoiceId: string): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')

  const problem = await dbAs(userId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id },
      select: { id: true, status: true, submittedToOslAt: true, signedAt: true },
    })
    if (!invoice) return 'That invoice no longer exists'
    if (invoice.status === 'VOID') return 'That invoice is void'
    if (invoice.submittedToOslAt) return null
    // The club's attestation is what makes the pack a submission rather than
    // two files. Recording it as sent without it would put the portal's own
    // record out of step with the document the Office of Finance receives.
    if (!invoice.signedAt) {
      return 'Verify and countersign the month before recording it as sent.'
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'SUBMITTED', submittedToOslAt: new Date() },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'claim.submit',
        targetType: 'Invoice',
        targetId: invoice.id,
        before: { status: invoice.status },
        after: { status: 'SUBMITTED' },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/monthly-run`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/**
 * Record that OSL have paid the coach.
 *
 * The last step, and the one the portal cannot observe: the money moves in
 * OSL's accounts, so somebody has to say so. `PAID` and `paidAt` have existed
 * since the schema was written with nothing that ever set them, which left
 * every submitted month sitting at "with OSL" forever and the run board
 * unable to tell a month that is finished from one that has been ignored.
 *
 * Reversible, because this is a human report about somebody else's ledger and
 * the usual way it goes wrong is marking the wrong coach.
 */
export async function markPaid(
  orgSlug: string,
  invoiceId: string,
  paid: boolean
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')

  const problem = await dbAs(userId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id },
      select: { id: true, status: true, submittedToOslAt: true, paidAt: true },
    })
    if (!invoice) return 'That invoice no longer exists'
    if (invoice.status === 'VOID') return 'That invoice is void'
    if (paid && !invoice.submittedToOslAt) {
      return 'OSL cannot have paid a claim that has not been sent to them.'
    }
    if (paid === (invoice.paidAt !== null)) return null

    await tx.invoice.update({
      where: { id: invoice.id },
      data: paid
        ? { status: 'PAID', paidAt: new Date() }
        : { status: 'SUBMITTED', paidAt: null },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: paid ? 'claim.paid' : 'claim.unpaid',
        targetType: 'Invoice',
        targetId: invoice.id,
        before: { status: invoice.status, paidAt: invoice.paidAt },
        after: { status: paid ? 'PAID' : 'SUBMITTED' },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/monthly-run`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/**
 * Record that a month's coaches were paid outside the portal, or take it back.
 *
 * For the months before the portal existed, whose classes arrived with the
 * attendance import and would otherwise sit on the home screen as unclaimed
 * forever. A person's word, so it is audited and reversible, and it refuses
 * the month in progress: that one cannot have been paid yet.
 */
export async function markMonthPaidOutside(
  orgSlug: string,
  period: string,
  settled: boolean
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')

  const match = /^(\d{4})-(\d{2})$/.exec(period)
  const periodYear = Number(match?.[1])
  const periodMonth = Number(match?.[2])
  if (!match || periodMonth < 1 || periodMonth > 12) return { error: 'Pick a month' }

  const now = new Date()
  if (periodYear * 12 + periodMonth >= now.getFullYear() * 12 + now.getMonth() + 1) {
    return { error: 'Only a month that has finished can have been paid.' }
  }

  await dbAs(userId, async (tx) => {
    const key = { orgId_periodYear_periodMonth: { orgId: org.id, periodYear, periodMonth } }
    const existing = await tx.coachMonthSettlement.findUnique({ where: key, select: { id: true } })
    if (settled === Boolean(existing)) return

    const row = settled
      ? await tx.coachMonthSettlement.create({
          data: { orgId: org.id, periodYear, periodMonth, settledById: userId },
          select: { id: true },
        })
      : await tx.coachMonthSettlement.delete({ where: key, select: { id: true } })

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: settled ? 'claim.month_paid_outside' : 'claim.month_paid_outside_undone',
        targetType: 'CoachMonthSettlement',
        targetId: row.id,
        after: { period, settled },
      },
      tx
    )
  })

  revalidatePath(`/${orgSlug}/monthly-run`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}
