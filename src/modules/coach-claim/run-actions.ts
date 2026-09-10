'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { allocateReference } from '@/modules/references'
import { financialYearOf } from '@/modules/references/format'
import { buildClaim, buildClaimContext, localDateKey } from './monthly-run'
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
    const existing = await tx.invoice.findFirst({
      where: {
        orgId: org.id,
        instructorId: parsed.data.instructorId,
        periodYear,
        periodMonth,
      },
      select: { id: true, status: true },
    })
    if (existing && existing.status !== 'VOID') {
      return 'That month is already raised for this coach. Download it, or void it first.'
    }
    if (existing) {
      // A voided invoice keeps its reference number — the gap in the series is
      // the audit trail — so re-raising means a new row and a new number, and
      // the unique key on (org, coach, month) has to be cleared first.
      return 'That month was voided. Re-raising a voided month is not built yet.'
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
      select: { projectCode: true },
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

/** Mark the month as sent to OSL. */
export async function markSubmitted(orgSlug: string, invoiceId: string): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'claim.generate')

  const problem = await dbAs(userId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id },
      select: { id: true, status: true, submittedToOslAt: true },
    })
    if (!invoice) return 'That invoice no longer exists'
    if (invoice.status === 'VOID') return 'That invoice is void'
    if (invoice.submittedToOslAt) return null

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
