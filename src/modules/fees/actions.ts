'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { FeeTier } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { allocateReference } from '@/modules/references'
import { financialYearOf } from '@/modules/references/format'
import { addWorkingDays } from '@/modules/coach-claim/deadlines'
import { amountForTier, tierFor } from './tiers'
import { splitGst, DEFAULT_GST_BASIS_POINTS } from './money'
import { validateProof, putProof, ProofRejected, MAX_PROOF_BYTES } from './proof'
import { validateQr, putQr, QrRejected, MAX_QR_BYTES } from './qr'

export interface FeeState {
  error: string | null
  ok?: boolean
}

const declareSchema = z.object({
  termId: z.string().min(1),
  // The bank's own reference, so the exco can find the line on the statement.
  reference: z
    .string()
    .trim()
    .min(3, 'Copy the reference from your PayNow confirmation')
    .max(64, 'That is longer than a payment reference'),
})

/**
 * A member saying they have paid.
 *
 * A claim, not money. The amount is never posted by the browser — it comes
 * from the term's configured tier — and the status this writes can only ever
 * be DECLARED. Only the exco can move it to CONFIRMED, and never for
 * themselves, which is the one control the whole of fee collection rests on.
 *
 * A declaration without a screenshot is incomplete rather than pending: that
 * screenshot is the entire evidence base for the confirmation that follows.
 */
export async function declarePayment(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.declare')

  const parsed = declareSchema.safeParse({
    termId: formData.get('termId') ?? '',
    reference: formData.get('reference') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That declaration is not valid' }
  }

  const file = formData.get('proof')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Attach a screenshot of the PayNow confirmation.' }
  }
  if (file.size > MAX_PROOF_BYTES) {
    return { error: `That image is over ${MAX_PROOF_BYTES / 1_000_000} MB.` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let format
  try {
    format = validateProof(bytes)
  } catch (error) {
    if (error instanceof ProofRejected) return { error: error.message }
    throw error
  }

  type Problem = keyof typeof PROBLEMS
  type Context =
    | { problem: Problem }
    | {
        problem?: undefined
        member: { id: string; rosterLabel: string | null; isActive: boolean }
        term: { id: string; fullFeeCents: number; halfFeeCents: number; exchangeFeeCents: number | null }
        existingId: string | null
      }

  const context: Context = await dbAs(userId, async (tx) => {
    const member = await tx.member.findFirst({
      where: { orgId: org.id, userId },
      select: { id: true, rosterLabel: true, isActive: true },
    })
    if (!member) return { problem: 'ROSTER' as const }
    // tierFor returns null for a label like "Graduated", and null means owes
    // nothing. Replacing it with FULL — which is what `?? 'FULL'` did — would
    // show a graduated exco member a seventy-dollar bill and take their money.
    if (!member.isActive || tierFor(member.rosterLabel).tier === null) {
      return { problem: 'DEPARTED' as const }
    }

    const term = await tx.term.findFirst({
      where: { id: parsed.data.termId, orgId: org.id },
      select: {
        id: true,
        fullFeeCents: true,
        halfFeeCents: true,
        exchangeFeeCents: true,
        closedAt: true,
      },
    })
    if (!term) return { problem: 'TERM' as const }
    if (term.closedAt) return { problem: 'CLOSED' as const }

    const existing = await tx.feePayment.findUnique({
      where: { termId_memberId: { termId: term.id, memberId: member.id } },
      select: { id: true, status: true },
    })
    if (existing?.status === 'CONFIRMED') return { problem: 'CONFIRMED' as const }

    return { member, term, existingId: existing?.id ?? null }
  })

  if (context.problem) return { error: PROBLEMS[context.problem] }

  const { member, term, existingId } = context
  // Uploaded outside the transaction: it leaves the database for object
  // storage, and a pooled connection should not be held open across that.
  const proofPath = await putProof(term.id, member.id, bytes, format)

  const late = await dbAs(userId, async (tx) => {
    // Everything the first transaction checked is checked again here, because
    // the upload happened in between and it is not instant. Without this, an
    // exco member confirming during that window has their confirmation undone
    // by the write that follows — and a collection closed during it takes a
    // declaration it can no longer bank.
    const still = await tx.term.findFirst({
      where: { id: term.id, orgId: org.id },
      select: { closedAt: true },
    })
    if (still?.closedAt) return 'CLOSED' as const

    const tier: FeeTier = tierFor(member.rosterLabel).tier ?? 'FULL'
    const amountCents = amountForTier(tier, term)
    const declaredAt = new Date()

    // A re-declaration replaces the last one: somebody who paid the wrong
    // amount and paid again should not leave two claims for the exco to
    // choose between.
    const data = {
      tier,
      amountCents,
      status: 'DECLARED' as const,
      declaredAt,
      declaredByUserId: userId,
      paymentReference: parsed.data.reference,
      paymentProofPath: proofPath,
      rejectedReason: null,
      confirmedAt: null,
      confirmedByUserId: null,
    }

    let paymentId = existingId
    if (existingId) {
      // Conditional on it still being undecided. A confirmation that landed
      // while the screenshot was uploading must not be rolled back into a
      // declaration by a request that started before it.
      const claimed = await tx.feePayment.updateMany({
        where: { id: existingId, status: { in: ['DECLARED', 'REJECTED'] } },
        data,
      })
      if (claimed.count !== 1) return 'DECIDED' as const
    } else {
      const created = await tx.feePayment.create({
        data: { orgId: org.id, termId: term.id, memberId: member.id, ...data },
        select: { id: true },
      })
      paymentId = created.id
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.declare',
        targetType: 'FeePayment',
        targetId: paymentId!,
        // The reference, never the screenshot. An audit log is read by more
        // people than the bucket is.
        after: { tier, amountCents, reference: parsed.data.reference },
      },
      tx
    )
    return null
  })

  if (late === 'CLOSED') return { error: PROBLEMS.CLOSED }
  if (late === 'DECIDED') {
    return {
      error:
        'The exco decided that payment while this was uploading. Reload to see what they said.',
    }
  }

  revalidatePath(`/${orgSlug}/fees`)
  return { error: null, ok: true }
}

const PROBLEMS = {
  ROSTER:
    'You are not on the club roster yet, so there is nothing to pay against. Ask an exco member to add you.',
  TERM: 'That term no longer exists.',
  CLOSED: 'That collection has been closed and banked in. Speak to the treasurer.',
  CONFIRMED: 'Your payment for that term is already confirmed.',
  DEPARTED:
    'The roster has you as having left the club, so there is nothing to pay. If that is wrong, ask an exco member to put it right first.',
} as const

const decideSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
  /**
   * OFFICIAL is the bulk collection banked in through the deposit form.
   * UNOFFICIAL is the exception path from the guidelines: money the exco end
   * up holding outside the OSL accounts, which needs a reason on the record
   * because there is no WBS element to quote against it and nothing for OSL
   * to reimburse.
   */
  route: z.enum(['OFFICIAL', 'UNOFFICIAL']).default('OFFICIAL'),
})

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
      select: { id: true, name: true, incomeDeposit: { select: { id: true } } },
    })
  )
  if (!term) return { error: 'That collection no longer exists.' }
  if (term.incomeDeposit) {
    return { error: 'That collection is closed and banked in. Its QR cannot be changed.' }
  }

  const key = await putQr(term.id, bytes, format)

  // Re-check that the collection is still open in the same transaction that
  // writes, not only in the read above. Between the two, somebody else can
  // close the collection — and a QR attached to a banked collection is a
  // payment code nobody is reconciling against.
  const raced = await dbAs(userId, async (tx) => {
    const deposit = await tx.incomeDeposit.findFirst({
      where: { termId: term.id, orgId: org.id },
      select: { id: true },
    })
    if (deposit) return true

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
 * The exco confirming a declaration against the bank statement.
 *
 * Never your own. A member confirming their own payment is not a control, it
 * is a formality — the same reasoning as an access request nobody else
 * approves.
 */
export async function confirmPayment(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = decideSchema.safeParse({
    paymentId: formData.get('paymentId') ?? '',
    reason: formData.get('reason') ?? '',
    route: formData.get('route') ?? 'OFFICIAL',
  })
  if (!parsed.success) return { error: 'That payment could not be found' }

  const routeReason = parsed.data.reason?.trim() || null
  if (parsed.data.route === 'UNOFFICIAL' && !routeReason) {
    // Required by the guidelines and by the next treasurer: a figure sitting
    // outside the OSL accounts with no reason on it is one nobody can explain
    // at handover.
    return { error: 'Say why this one is outside the OSL collection.' }
  }

  const problem = await dbAs(userId, async (tx) => {
    const payment = await tx.feePayment.findFirst({
      where: { id: parsed.data.paymentId, orgId: org.id },
      select: {
        id: true,
        status: true,
        declaredByUserId: true,
        paymentProofPath: true,
        amountCents: true,
        term: { select: { incomeDeposit: { select: { id: true } } } },
      },
    })
    if (!payment) return 'That payment no longer exists'
    if (payment.term.incomeDeposit) return 'That collection has already been banked in.'
    if (payment.status === 'CONFIRMED') return null
    if (payment.declaredByUserId === userId) {
      return 'Somebody else has to confirm your own payment.'
    }
    if (!payment.paymentProofPath) {
      return 'That declaration has no screenshot against it, so there is nothing to check it by.'
    }

    // Conditional, so two treasurers working the queue at once cannot both
    // believe they were the one who confirmed it.
    const claimed = await tx.feePayment.updateMany({
      where: { id: payment.id, status: 'DECLARED' },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedByUserId: userId,
        route: parsed.data.route,
        routeReason,
        rejectedReason: null,
      },
    })
    if (claimed.count !== 1) return 'Somebody else has just decided that one. Reload the page.'

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.confirm',
        targetType: 'FeePayment',
        targetId: payment.id,
        before: { status: payment.status },
        after: {
          status: 'CONFIRMED',
          amountCents: payment.amountCents,
          route: parsed.data.route,
          routeReason,
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

/** Reject one, with a reason the member can read. */
export async function rejectPayment(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = decideSchema.safeParse({
    paymentId: formData.get('paymentId') ?? '',
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success) return { error: 'That payment could not be found' }
  const reason = parsed.data.reason?.trim()
  if (!reason) {
    // A refusal somebody cannot answer is a refusal they will bring to the
    // treasurer in person, which is the work this screen exists to avoid.
    return { error: 'Say why, so they know what to fix.' }
  }

  const problem = await dbAs(userId, async (tx) => {
    const payment = await tx.feePayment.findFirst({
      where: { id: parsed.data.paymentId, orgId: org.id },
      select: { id: true, status: true, declaredByUserId: true },
    })
    if (!payment) return 'That payment no longer exists'
    if (payment.declaredByUserId === userId) {
      return 'Somebody else has to decide your own payment.'
    }

    const claimed = await tx.feePayment.updateMany({
      where: { id: payment.id, status: 'DECLARED' },
      data: {
        status: 'REJECTED',
        rejectedReason: reason,
        confirmedAt: null,
        confirmedByUserId: null,
      },
    })
    if (claimed.count !== 1) return 'Somebody else has just decided that one. Reload the page.'

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.reject',
        targetType: 'FeePayment',
        targetId: payment.id,
        before: { status: payment.status },
        after: { status: 'REJECTED', reason },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  return { error: null, ok: true }
}


/**
 * Record that the deposit form has gone to OSL.
 *
 * Closing a collection, filing the form and the money landing are three
 * events, and the portal used to collapse them into one: the moment you
 * closed, the screen said "Banked in". It cannot see OSL's inbox or the
 * club's statement, so this is somebody reporting what they did — and
 * reversible, because the usual way it goes wrong is clicking it before
 * actually sending the email.
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

const createTermSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the term a name').max(60, 'That name is very long'),
    startDate: z.string().trim().min(1, 'When does the term start?'),
    endDate: z.string().trim().min(1, 'When does the term end?'),
    fullFee: z.coerce.number().min(0, 'A fee cannot be negative'),
    halfFee: z.coerce.number().min(0, 'A fee cannot be negative'),
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
 * Rates are asked for here rather than left to a second screen: a term with no
 * rates is a term that charges nothing, and a collection that quietly collects
 * nothing is worse than one that has not been set up.
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
    fullFee: formData.get('fullFee') ?? '0',
    halfFee: formData.get('halfFee') ?? '0',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That term is not valid' }
  }

  const { name, startDate, endDate, fullFee, halfFee } = parsed.data

  const from = parseDate(startDate)
  const to = parseDate(endDate)
  if (!from || !to) return { error: 'Those dates are not valid.' }

  const problem = await dbAs(userId, async (tx) => {
    const clash = await tx.term.findFirst({
      where: { orgId: org.id, name },
      select: { id: true },
    })
    if (clash) return `There is already a term called ${name}.`

    const term = await tx.term.create({
      data: {
        orgId: org.id,
        name,
        startDate: from,
        endDate: to,
        fullFeeCents: Math.round(fullFee * 100),
        halfFeeCents: Math.round(halfFee * 100),
      },
      select: { id: true, name: true },
    })

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.term_created',
        targetType: 'Term',
        targetId: term.id,
        after: { name: term.name, startDate, endDate },
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
    const term = await tx.term.findFirst({
      where: { id: parsed.data.termId, orgId: org.id },
      select: { id: true, incomeDeposit: { select: { id: true } } },
    })
    if (!term) return 'That term no longer exists'
    if (term.incomeDeposit) {
      // Changing a rate after the money is banked would restate what people
      // owed against a figure that has already gone to OSL.
      return 'That collection has been banked in. Its rates are fixed now.'
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
    const term = await tx.term.findFirst({
      where: { id: termId, orgId: org.id },
      select: {
        id: true,
        name: true,
        finalCollectionAt: true,
        incomeDeposit: { select: { id: true } },
      },
    })

    if (!term) return 'That term no longer exists'
    if (term.incomeDeposit) return 'That collection is already closed.'

    const pending = await tx.feePayment.count({
      where: { orgId: org.id, termId: term.id, status: 'DECLARED' },
    })
    if (pending > 0) {
      return `${pending} declaration${pending === 1 ? '' : 's'} still to decide. Clear the queue first — a closed collection cannot take them.`
    }

    const confirmed = await tx.feePayment.aggregate({
      where: { orgId: org.id, termId: term.id, status: 'CONFIRMED', route: 'OFFICIAL' },
      _sum: { amountCents: true },
    })
    const grossCents = confirmed._sum.amountCents ?? 0
    if (grossCents === 0) {
      return 'Nothing has been confirmed on the official route, so there is nothing to bank in.'
    }

    const settings = await tx.organisationSettings.findUnique({
      where: { orgId: org.id },
      select: { projectCode: true, cluster: true, gstBasisPoints: true },
    })
    const split = splitGst(grossCents, settings?.gstBasisPoints ?? DEFAULT_GST_BASIS_POINTS)

    const finalCollectionAt = term.finalCollectionAt ?? new Date()
    const reference = await allocateReference(tx, {
      orgId: org.id,
      series: 'INC',
      financialYear: financialYearOf(finalCollectionAt),
      projectCode: settings?.projectCode ?? '097',
    })

    // The unique key on termId is what actually serialises two treasurers
    // pressing this at once. The precheck above is for the message; this is
    // for the outcome.
    await tx.term.update({ where: { id: term.id }, data: { closedAt: new Date() } })

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
    if (isDuplicateClosure(error)) return 'Somebody else closed that collection a moment ago.'
    throw error
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/**
 * Prisma's unique-violation code.
 *
 * The unique key on IncomeDeposit.termId is what actually serialises two
 * treasurers pressing "close" at the same moment; the precheck above only
 * makes the usual case say something useful. The loser of that race should be
 * told what happened rather than shown a stack trace.
 */
function isDuplicateClosure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  )
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

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return new Date(`${value}T00:00:00Z`)
}

const claimSchema = z.object({
  studentId: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(
      z
        .string()
        .min(5, 'That does not look like a student ID — it is the number on your student card')
        .max(12, 'That is longer than a student ID')
    ),
})

/**
 * An account saying which roster row it is, by student ID.
 *
 * Student IDs are unique and never change, which makes them the right key.
 * They are also printed on every attendance sheet and run in sequence, which
 * is why this links nothing: it records the claim, and an exco member — who
 * can see the roster row it matches and knows the person — confirms it.
 */
export async function claimStudentId(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const parsed = claimSchema.safeParse({ studentId: String(formData.get('studentId') ?? '') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That student ID is not valid' }
  }

  const problem = await dbAs(userId, async (tx) => {
    const linked = await tx.member.findFirst({ where: { orgId: org.id, userId }, select: { id: true } })
    if (linked) return 'Your account is already linked to the roster.'

    await tx.user.update({
      where: { id: userId },
      data: { claimedStudentId: parsed.data.studentId, claimedStudentIdAt: new Date() },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'member.claim_student_id',
        targetType: 'User',
        targetId: userId,
        after: { studentId: parsed.data.studentId },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

const linkSchema = z.object({
  userId: z.string().min(1),
  memberId: z.string().min(1),
})

/**
 * Attach a signed-in account to a roster row by hand.
 *
 * Sign-in links itself when the account's email is the one the club already
 * holds, which covers most people. It does not cover somebody who signed up
 * with a personal address, and asking them to pick their own row would be
 * asking them to assert an identity — so the club does it, and it is audited.
 */
export async function linkMemberAccount(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId: actorId } = await requirePermission(org.id, 'org.manage_members')

  const parsed = linkSchema.safeParse({
    userId: formData.get('userId') ?? '',
    memberId: formData.get('memberId') ?? '',
  })
  if (!parsed.success) return { error: 'Pick both an account and a roster row' }

  const problem = await dbAs(actorId, async (tx) => {
    const member = await tx.member.findFirst({
      where: { id: parsed.data.memberId, orgId: org.id },
      select: { id: true, fullName: true, userId: true },
    })
    if (!member) return 'That roster row no longer exists'
    if (member.userId) return `${member.fullName} is already linked to an account.`

    // The roster row is scoped to this organisation; the account has to be
    // too. Without this an id posted from anywhere attaches a stranger's
    // account to a club roster row, and the rightful owner can never link.
    const membership = await tx.organisationMembership.findUnique({
      where: { userId_orgId: { userId: parsed.data.userId, orgId: org.id } },
      select: { isActive: true },
    })
    if (!membership?.isActive) return 'That account is not a member of this organisation.'

    const taken = await tx.member.findFirst({
      where: { orgId: org.id, userId: parsed.data.userId },
      select: { fullName: true },
    })
    if (taken) {
      // One account, one roster row. Two would make "what do I owe" ambiguous
      // and let one person hold two subscriptions.
      return `That account is already linked to ${taken.fullName}.`
    }

    await tx.member.update({
      where: { id: member.id },
      data: { userId: parsed.data.userId },
    })
    // The claim is left on the account. It only ever surfaces for accounts
    // with no roster row, so once linked it stops showing — and the users
    // policy rightly will not let one person rewrite another's row to tidy it.
    await writeAudit(
      {
        orgId: org.id,
        actorId,
        action: 'member.link_account',
        targetType: 'Member',
        targetId: member.id,
        after: { userId: parsed.data.userId, memberName: member.fullName },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  return { error: null, ok: true }
}
