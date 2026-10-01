'use server'

/** Running a term's collection: the term itself, its PayNow QR, closing it, and the deposit form going to OSL. */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { allocateReference } from '@/modules/references'
import { financialYearOf } from '@/modules/references/format'
import { addWorkingDays } from '@/modules/coach-claim/deadlines'
import { singaporeDay, toDateColumn } from '@/lib/date-only'
import { splitGst, DEFAULT_GST_BASIS_POINTS } from './money'
import { lockTermFees } from './declaration'
import { writeCloseCharges } from './close-charges'
import { validateQr, putQr, QrRejected, MAX_QR_BYTES } from './qr'
import { type FeeState, isUniqueViolation } from './action-state'

const createTermSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the term a name').max(60, 'That name is very long'),
    startDate: z.string().trim().min(1, 'When does the term start?'),
    endDate: z.string().trim().min(1, 'When does the term end?'),
    copyFromTermId: z.string().trim().optional(),
    fullFee: z.string(),
    halfFee: z.string(),
  })
  .refine((value) => value.endDate > value.startDate, {
    message: 'The term has to end after it starts',
  })

/**
 * Open a term.
 *
 * There was no way to do this at all. Terms came from the seed script, which
 * meant a club that had not been seeded — which is every club but this one —
 * could never reach subscription collection or the attendance import, because
 * both are read against a term and both simply refused to load without one.
 *
 * The first term asks for rates. Every later term copies the previous rates,
 * so starting a new period is one decision rather than the same fee setup
 * questionnaire again. Rates can still be changed on the collection screen.
 */
export async function createTerm(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = createTermSchema.safeParse({
    name: formData.get('name') ?? '',
    startDate: formData.get('startDate') ?? '',
    endDate: formData.get('endDate') ?? '',
    copyFromTermId: String(formData.get('copyFromTermId') ?? '').trim() || undefined,
    fullFee: String(formData.get('fullFee') ?? ''),
    halfFee: String(formData.get('halfFee') ?? ''),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That term is not valid' }
  }

  const { name, startDate, endDate, copyFromTermId } = parsed.data

  const from = parseDate(startDate)
  const to = parseDate(endDate)
  if (!from || !to) return { error: 'Those dates are not valid.' }

  const fullFee = Number(parsed.data.fullFee)
  const halfFee = Number(parsed.data.halfFee)
  if (!copyFromTermId && (!Number.isFinite(fullFee) || !Number.isFinite(halfFee) || fullFee < 0 || halfFee < 0)) {
    return { error: 'Enter valid full-term and half-term fees.' }
  }

  const problem = await dbAs(userId, async (tx) => {
    const clash = await tx.term.findFirst({
      where: { orgId: org.id, name },
      select: { id: true },
    })
    if (clash) return `There is already a term called ${name}.`

    const copied = copyFromTermId
      ? await tx.term.findFirst({
          where: { id: copyFromTermId, orgId: org.id },
          select: { fullFeeCents: true, halfFeeCents: true, exchangeFeeCents: true },
        })
      : null
    if (copyFromTermId && !copied) return 'The previous term no longer exists. Reload the page.'

    const term = await tx.term.create({
      data: {
        orgId: org.id,
        name,
        startDate: from,
        endDate: to,
        fullFeeCents: copied?.fullFeeCents ?? Math.round(fullFee * 100),
        halfFeeCents: copied?.halfFeeCents ?? Math.round(halfFee * 100),
        exchangeFeeCents: copied?.exchangeFeeCents ?? null,
      },
      select: { id: true, name: true },
    })
    // Every term has its membership form, waiting as a draft to be opened.
    await tx.membershipForm.create({ data: { orgId: org.id, termId: term.id } })

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.term_created',
        targetType: 'Term',
        targetId: term.id,
        after: { name: term.name, startDate, endDate, copiedRatesFrom: copyFromTermId ?? null },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/settings/attendance`)
  return { error: null, ok: true }
}

const termSchema = z.object({
  termId: z.string().min(1),
  fullFee: z.coerce.number().min(0, 'A fee cannot be negative'),
  halfFee: z.coerce.number().min(0, 'A fee cannot be negative'),
  exchangeFee: z.string().trim(),
  collectionOpensAt: z.string().trim(),
  finalCollectionAt: z.string().trim(),
})

/** Set a term's rates and its collection window. */
export async function updateTerm(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = termSchema.safeParse({
    termId: formData.get('termId') ?? '',
    fullFee: formData.get('fullFee') ?? '0',
    halfFee: formData.get('halfFee') ?? '0',
    exchangeFee: formData.get('exchangeFee') ?? '',
    collectionOpensAt: formData.get('collectionOpensAt') ?? '',
    finalCollectionAt: formData.get('finalCollectionAt') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Those details are not valid' }
  }

  const exchangeFeeCents =
    parsed.data.exchangeFee === '' ? null : Math.round(Number(parsed.data.exchangeFee) * 100)
  if (exchangeFeeCents !== null && (!Number.isFinite(exchangeFeeCents) || exchangeFeeCents < 0)) {
    return { error: 'That exchange fee is not a number' }
  }

  const problem = await dbAs(userId, async (tx) => {
    await lockTermFees(tx, parsed.data.termId)
    const term = await tx.term.findFirst({
      where: { id: parsed.data.termId, orgId: org.id },
      select: { id: true, closedAt: true },
    })
    if (!term) return 'That term no longer exists'
    if (term.closedAt) {
      // Changing a rate after the money is banked would restate what people
      // owed against a figure that has already gone to OSL.
      return 'That collection is closed. Its rates are fixed now.'
    }

    await tx.term.update({
      where: { id: term.id },
      data: {
        fullFeeCents: Math.round(parsed.data.fullFee * 100),
        halfFeeCents: Math.round(parsed.data.halfFee * 100),
        exchangeFeeCents,
        collectionOpensAt: parseDate(parsed.data.collectionOpensAt),
        finalCollectionAt: parseDate(parsed.data.finalCollectionAt),
      },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.term_update',
        targetType: 'Term',
        targetId: term.id,
        after: {
          fullFeeCents: Math.round(parsed.data.fullFee * 100),
          halfFeeCents: Math.round(parsed.data.halfFee * 100),
          exchangeFeeCents,
        },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  return { error: null, ok: true }
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return new Date(`${value}T00:00:00Z`)
}

/**
 * Put this collection's PayNow QR up.
 *
 * Stored against the term, because a fresh QR is generated for each
 * collection. Held once on the club, the second term would show members the
 * first term's code and their money would land somewhere nobody is
 * reconciling against this roster.
 *
 * A replaced QR keeps the old object rather than overwriting it: a member who
 * loaded the page a minute before the swap is looking at a code that must
 * either still work or visibly fail, never silently resolve to different
 * bytes at the same address.
 */
export async function uploadPaynowQr(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const termId = String(formData.get('termId') ?? '')
  if (!termId) return { error: 'No collection was named.' }

  const file = formData.get('qr')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose the QR image first.' }
  }
  if (file.size > MAX_QR_BYTES) {
    return { error: `That image is over ${MAX_QR_BYTES / 1_000_000} MB.` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let format
  try {
    format = validateQr(bytes)
  } catch (error) {
    if (error instanceof QrRejected) return { error: error.message }
    throw error
  }

  // Read the term under RLS before writing anything to storage, so a term id
  // belonging to another club cannot cause an upload at all.
  const term = await dbAs(userId, (tx) =>
    tx.term.findFirst({
      where: { id: termId, orgId: org.id },
      select: { id: true, name: true, closedAt: true },
    })
  )
  if (!term) return { error: 'That collection no longer exists.' }
  if (term.closedAt) {
    return { error: 'That collection is closed. Its QR cannot be changed.' }
  }

  const key = await putQr(term.id, bytes, format)

  // Re-check that the collection is still open in the same transaction that
  // writes, not only in the read above. Between the two, somebody else can
  // close the collection — and a QR attached to a banked collection is a
  // payment code nobody is reconciling against.
  const raced = await dbAs(userId, async (tx) => {
    // The lock closing takes, so the two cannot pass each other.
    await lockTermFees(tx, term.id)
    const closed = await tx.term.findFirst({
      where: { id: term.id, orgId: org.id, closedAt: { not: null } },
      select: { id: true },
    })
    if (closed) return true

    await tx.term.update({
      where: { id: term.id },
      data: { paynowQrPath: key, paynowQrUploadedAt: new Date() },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.qr_uploaded',
        targetType: 'Term',
        targetId: term.id,
        metadata: { termName: term.name },
      },
      tx
    )
    return false
  })

  if (raced) {
    return { error: 'Somebody closed that collection a moment ago. The QR was not changed.' }
  }

  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/fees`)
  return { error: null, ok: true }
}

/**
 * Close the collection and raise the Income Deposit Form.
 *
 * The gross is the sum of what was actually confirmed on the official route,
 * never a figure anybody types. GST is derived from it (§2) and the form is
 * due one working day after the final collection date (§2.2).
 */
export async function closeCollection(
  orgSlug: string,
  termId: string
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')
  await verifySession()

  const problem = await dbAs(userId, async (tx) => {
    // Held until the deposit row is written, so nothing can change what the
    // total below counted before the collection is marked closed.
    await lockTermFees(tx, termId)
    const term = await tx.term.findFirst({
      where: { id: termId, orgId: org.id },
      select: {
        id: true,
        name: true,
        finalCollectionAt: true,
        closedAt: true,
        incomeDeposit: { select: { id: true } },
      },
    })

    if (!term) return 'That term no longer exists'
    if (term.incomeDeposit || term.closedAt) return 'That collection is already closed.'

    const pending = await tx.feePayment.count({
      where: { orgId: org.id, termId: term.id, status: 'DECLARED' },
    })
    if (pending > 0) {
      return `${pending} declaration${pending === 1 ? '' : 's'} still to decide. Clear the queue first — a closed collection cannot take them.`
    }

    // Money somebody paid through the form before anybody knew which roster
    // row was theirs. Closing now would bank without it and strand it.
    const held = await tx.membershipResponse.count({
      where: { orgId: org.id, termId: term.id, heldProofPath: { not: null } },
    })
    if (held > 0) {
      return `${held} form response${held === 1 ? '' : 's'} still ${held === 1 ? 'holds' : 'hold'} a payment that isn't on the roster. Sort ${held === 1 ? 'it' : 'them'} out from Responses first.`
    }

    const confirmed = await tx.feePayment.aggregate({
      where: { orgId: org.id, termId: term.id, status: 'CONFIRMED', route: 'OFFICIAL' },
      _sum: { amountCents: true },
    })
    const grossCents = confirmed._sum.amountCents ?? 0

    // Nothing came in through OSL — a free term, or everything was paid to
    // the exco directly. There is no money to bank and no Income Deposit Form
    // to raise, so a reference number would be spent on nothing. The
    // collection still has to end, or it sits on the home screen for ever.
    if (grossCents === 0) {
      await tx.membershipForm.updateMany({
        where: { termId: term.id, state: { not: 'CLOSED' } },
        data: { state: 'CLOSED', closedAt: new Date() },
      })
      await writeCloseCharges(tx, org.id, term.id)
      await tx.term.update({ where: { id: term.id }, data: { closedAt: new Date(), chargesRecordedAt: new Date() } })
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'fee.close_collection',
          targetType: 'Term',
          targetId: term.id,
          after: { termId: term.id, grossCents: 0, depositForm: false },
        },
        tx
      )
      return null
    }

    const settings = await tx.organisationSettings.findUnique({
      where: { orgId: org.id },
      select: { projectCode: true, cluster: true, gstBasisPoints: true },
    })
    const split = splitGst(grossCents, settings?.gstBasisPoints ?? DEFAULT_GST_BASIS_POINTS)

    // Today in Singapore, as a date, when nobody set one: the deposit form
    // prints this day, and a bare instant stamped before 8am would print as
    // yesterday on a server running in UTC.
    const finalCollectionAt = term.finalCollectionAt ?? toDateColumn(singaporeDay(new Date()))
    const reference = await allocateReference(tx, {
      orgId: org.id,
      series: 'INC',
      financialYear: financialYearOf(finalCollectionAt),
      projectCode: settings?.projectCode ?? '097',
    })

    // Banked in means nobody new can join through the form either. Before the
    // term is marked closed, because nothing about a closed term changes.
    await tx.membershipForm.updateMany({
      where: { termId: term.id, state: { not: 'CLOSED' } },
      data: { state: 'CLOSED', closedAt: new Date() },
    })

    // The unique key on termId is what actually serialises two treasurers
    // pressing this at once. The precheck above is for the message; this is
    // for the outcome.
    await writeCloseCharges(tx, org.id, term.id)
    await tx.term.update({ where: { id: term.id }, data: { closedAt: new Date(), chargesRecordedAt: new Date() } })

    const deposit = await tx.incomeDeposit.create({
      data: {
        orgId: org.id,
        termId: term.id,
        referenceNumberId: reference.id,
        eventName: `${term.name} subscriptions`,
        description: `Membership subscriptions collected for ${term.name}`,
        // The revenue element, not the expense one: an Income Deposit Form is
        // money coming in.
        wbsElement: revenueWbs(settings?.projectCode ?? '097', settings?.cluster ?? 'ARTS'),
        grossCents: split.grossCents,
        netCents: split.netCents,
        gstCents: split.gstCents,
        finalCollectionAt,
        // §2.2: within one working day of the final collection.
        submissionDueAt: addWorkingDays(finalCollectionAt, 1),
        generatedAt: new Date(),
      },
      select: { id: true },
    })

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.close_collection',
        targetType: 'IncomeDeposit',
        targetId: deposit.id,
        after: {
          termId: term.id,
          reference: reference.formatted,
          grossCents: split.grossCents,
          netCents: split.netCents,
          gstCents: split.gstCents,
        },
      },
      tx
    )
    return null
  }).catch((error) => {
    if (isUniqueViolation(error)) return 'Somebody else closed that collection a moment ago.'
    throw error
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/**
 * The revenue WBS element (§4.5). Income has two — the expense one goes on
 * invoices, this one goes on deposit forms.
 */
function revenueWbs(projectCode: string, cluster: string): string {
  const code = CLUSTER_CODES[cluster.toUpperCase()] ?? CLUSTER_CODES.ARTS
  return `PN-00${projectCode}-${code}-${code}-R00`
}

/** Arts, Community, Culture and Makers share A3006; Sports uses A3005. */
const CLUSTER_CODES: Record<string, string> = {
  ARTS: 'A3006',
  COMMUNITY: 'A3006',
  CULTURE: 'A3006',
  MAKERS: 'A3006',
  SPORTS: 'A3005',
}

/**
 * Record that the deposit form has gone to OSL.
 *
 * Closing a collection, filing the form and the money landing are three
 * separate events. The portal cannot see OSL's inbox or the club's statement,
 * so this is somebody reporting what they did — and reversible, because the
 * usual way it goes wrong is clicking it before actually sending the email.
 */
export async function markDepositSubmitted(
  orgSlug: string,
  termId: string,
  submitted: boolean
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const problem = await dbAs(userId, async (tx) => {
    const deposit = await tx.incomeDeposit.findFirst({
      where: { termId, orgId: org.id },
      select: { id: true, submittedToOslAt: true },
    })
    if (!deposit) return 'That collection has not been closed yet.'
    if (submitted === (deposit.submittedToOslAt !== null)) return null

    await tx.incomeDeposit.update({
      where: { id: deposit.id },
      data: { submittedToOslAt: submitted ? new Date() : null },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: submitted ? 'fee.deposit_submitted' : 'fee.deposit_unsubmitted',
        targetType: 'IncomeDeposit',
        targetId: deposit.id,
        before: { submittedToOslAt: deposit.submittedToOslAt },
        after: { submittedToOslAt: submitted ? new Date() : null },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}
