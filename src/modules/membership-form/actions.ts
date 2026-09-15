'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { FeeTier, Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { studentIdFromEmail } from '@/core/auth/roster-match'
import { amountForTier, MEMBER_CHOICES, resolveFee, type ResolvedFee } from '@/modules/fees/tiers'
import { lockTermFees, writeDeclaration } from '@/modules/fees/declaration'
import { validateProof, putProof, discardProof, ProofRejected, MAX_PROOF_BYTES } from '@/modules/fees/proof'
import {
  MAX_OPTIONS,
  needsOptions,
  parseOptions,
  readAnswers,
  readBirthday,
  readStudentId,
  storedAnswers,
  type Question,
} from './questions'

export interface FormActionState {
  error: string | null
  ok?: boolean
  message?: string
  /** Keyed by field: `fullName`, `studentId`, `birthday`, `tier`, `payment`, or a question id. */
  fieldErrors?: Record<string, string>
}

function revalidateForm(orgSlug: string) {
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
}

/** The term's form, made on first touch for a term older than forms. */
async function ensureForm(tx: Prisma.TransactionClient, orgId: string, termId: string) {
  const existing = await tx.membershipForm.findFirst({ where: { orgId, termId } })
  if (existing) return existing
  return tx.membershipForm.create({ data: { orgId, termId } })
}

// ─── The exco running the form ──────────────────────────────────────

/**
 * Open the form for responses, close it, or open it again.
 *
 * Closing only stops new responses. Payments already sent can still be
 * checked and recorded, and the form can reopen as often as the exco like —
 * until the collection is banked in, which closes it for good.
 */
export async function setFormState(
  orgSlug: string,
  termId: string,
  next: 'OPEN' | 'CLOSED'
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const problem = await dbAs(userId, async (tx) => {
    const term = await tx.term.findFirst({
      where: { id: termId, orgId: org.id },
      select: { id: true, name: true, closedAt: true, fullFeeCents: true, paynowQrPath: true },
    })
    if (!term) return 'That term no longer exists.'
    if (term.closedAt) return `${term.name} has been banked in. Its form stays closed.`

    const form = await ensureForm(tx, org.id, term.id)
    if (form.state === next) return null

    if (next === 'OPEN') {
      // A form that opens without these asks people for money they cannot pay.
      const missing: string[] = []
      if (term.fullFeeCents === 0) missing.push('the fees')
      if (!term.paynowQrPath) missing.push('the PayNow QR')
      if (missing.length > 0) return `Add ${missing.join(' and ')} before opening the form.`
    }

    const now = new Date()
    await tx.membershipForm.update({
      where: { id: form.id },
      data:
        next === 'OPEN'
          ? { state: 'OPEN', openedAt: form.openedAt ?? now, closedAt: null }
          : { state: 'CLOSED', closedAt: now },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: next === 'OPEN' ? (form.state === 'CLOSED' ? 'form.reopen' : 'form.open') : 'form.close',
        targetType: 'MembershipForm',
        targetId: form.id,
        before: { state: form.state },
        after: { state: next },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidateForm(orgSlug)
  return { error: null, ok: true }
}

const settingsSchema = z.object({
  termId: z.string().min(1),
  intro: z.string().trim().max(1500, 'Keep the welcome note under 1,500 characters'),
  tierChoices: z.array(z.enum(['FULL', 'HALF', 'EXCHANGE_DISCOUNT'])),
})

/** The welcome note and which fees people may pick for themselves. */
export async function saveFormSettings(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = settingsSchema.safeParse({
    termId: formData.get('termId') ?? '',
    intro: formData.get('intro') ?? '',
    tierChoices: formData.getAll('tierChoice').map(String),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'That could not be saved' }
  const tierChoices = MEMBER_CHOICES.filter((tier) => parsed.data.tierChoices.includes(tier as never))

  const problem = await dbAs(userId, async (tx) => {
    const term = await tx.term.findFirst({ where: { id: parsed.data.termId, orgId: org.id }, select: { id: true, closedAt: true } })
    if (!term) return 'That term no longer exists.'
    if (term.closedAt) return 'That collection is closed.'
    const form = await ensureForm(tx, org.id, term.id)
    await tx.membershipForm.update({
      where: { id: form.id },
      data: { intro: parsed.data.intro || null, tierChoices: [...tierChoices] },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.settings',
        targetType: 'MembershipForm',
        targetId: form.id,
        after: { tierChoices, intro: Boolean(parsed.data.intro) },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidateForm(orgSlug)
  return { error: null, ok: true, message: 'Saved.' }
}

const questionSchema = z.object({
  termId: z.string().min(1),
  questionId: z.string().optional(),
  type: z.enum(['SHORT_TEXT', 'LONG_TEXT', 'YES_NO', 'ONE_CHOICE', 'MANY_CHOICES']),
  label: z.string().trim().min(1, 'Write the question').max(300, 'Keep the question under 300 characters'),
  help: z.string().trim().max(300, 'Keep the hint under 300 characters'),
  required: z.boolean(),
  options: z.string(),
})

/** Add a question of the club's own, or change one. */
export async function saveQuestion(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = questionSchema.safeParse({
    termId: formData.get('termId') ?? '',
    questionId: (formData.get('questionId') as string | null) || undefined,
    type: formData.get('type') ?? '',
    label: formData.get('label') ?? '',
    help: formData.get('help') ?? '',
    required: formData.get('required') === 'on',
    options: formData.get('options') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'That question is not valid' }
  const { termId, questionId, type, label, help, required } = parsed.data

  const options = needsOptions(type) ? parseOptions(parsed.data.options) : []
  if (needsOptions(type) && options.length < 2) return { error: 'Give at least two choices, one per line.' }
  if (options.length > MAX_OPTIONS) return { error: `Keep it to ${MAX_OPTIONS} choices.` }

  const problem = await dbAs(userId, async (tx) => {
    const term = await tx.term.findFirst({ where: { id: termId, orgId: org.id }, select: { id: true, closedAt: true } })
    if (!term) return 'That term no longer exists.'
    if (term.closedAt) return 'That collection is closed.'
    const form = await ensureForm(tx, org.id, term.id)

    let id = questionId
    if (questionId) {
      const updated = await tx.membershipQuestion.updateMany({
        where: { id: questionId, formId: form.id },
        data: { type, label, help: help || null, required, options },
      })
      if (updated.count !== 1) return 'That question has been removed.'
    } else {
      const count = await tx.membershipQuestion.count({ where: { formId: form.id } })
      if (count >= 30) return 'That is a lot of questions already. Thirty is the most a form takes.'
      const last = await tx.membershipQuestion.findFirst({
        where: { formId: form.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      const created = await tx.membershipQuestion.create({
        data: {
          orgId: org.id,
          formId: form.id,
          position: (last?.position ?? -1) + 1,
          type,
          label,
          help: help || null,
          required,
          options,
        },
        select: { id: true },
      })
      id = created.id
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: questionId ? 'form.question_edit' : 'form.question_add',
        targetType: 'MembershipQuestion',
        targetId: id!,
        after: { type, label, required, options },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidateForm(orgSlug)
  return { error: null, ok: true }
}

/** Take a question off the form. Answers already sent keep its wording. */
export async function deleteQuestion(orgSlug: string, questionId: string): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  await dbAs(userId, async (tx) => {
    const question = await tx.membershipQuestion.findFirst({
      where: { id: questionId, orgId: org.id },
      select: { id: true, label: true },
    })
    if (!question) return
    await tx.membershipQuestion.delete({ where: { id: question.id } })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.question_remove',
        targetType: 'MembershipQuestion',
        targetId: question.id,
        before: { label: question.label },
      },
      tx
    )
  })

  revalidateForm(orgSlug)
  return { error: null, ok: true }
}

/** Move a question one place up or down. */
export async function moveQuestion(
  orgSlug: string,
  questionId: string,
  direction: 'up' | 'down'
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  await dbAs(userId, async (tx) => {
    const question = await tx.membershipQuestion.findFirst({
      where: { id: questionId, orgId: org.id },
      select: { formId: true },
    })
    if (!question) return
    const all = await tx.membershipQuestion.findMany({
      where: { formId: question.formId },
      orderBy: { position: 'asc' },
      select: { id: true },
    })
    const index = all.findIndex((q) => q.id === questionId)
    const swap = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || swap < 0 || swap >= all.length) return
    ;[all[index], all[swap]] = [all[swap], all[index]]
    // Renumbered from zero, which also mends any gaps a deletion left.
    for (const [position, q] of all.entries()) {
      await tx.membershipQuestion.update({ where: { id: q.id }, data: { position } })
    }
  })

  revalidateForm(orgSlug)
  return { error: null, ok: true }
}

// ─── Filling it in ──────────────────────────────────────────────────

const referenceSchema = z
  .string()
  .trim()
  .min(3, 'Copy the reference from your PayNow confirmation')
  .max(64, 'That is longer than a payment reference')

/**
 * Send, or change, a membership form response.
 *
 * Somebody already linked to their roster row answers the club's questions,
 * picks their fee where the form lets them, and pays: their payment goes
 * straight to the exco to check, exactly as "I've paid" did.
 *
 * Somebody who is not linked tells the club who they are — name, student ID,
 * birthday — and can still pay in the same sitting. Their payment is held on
 * the response until an exco member matches them to a roster row or adds them
 * as new. They are never told whether their student ID is already on the
 * roster, because that would let anybody check who is in the club.
 */
export async function submitMembershipForm(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.declare')
  const termId = String(formData.get('termId') ?? '')

  const context = await dbAs(userId, async (tx) => {
    const [user, form, term, member, response] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { email: true } }),
      tx.membershipForm.findFirst({
        where: { orgId: org.id, termId },
        include: { questions: { orderBy: { position: 'asc' } } },
      }),
      tx.term.findFirst({
        where: { id: termId, orgId: org.id },
        select: { id: true, closedAt: true, fullFeeCents: true, halfFeeCents: true, exchangeFeeCents: true },
      }),
      tx.member.findFirst({
        where: { orgId: org.id, userId },
        select: {
          id: true,
          fullName: true,
          studentId: true,
          rosterLabel: true,
          isActive: true,
          birthDay: true,
          birthMonth: true,
          birthYear: true,
        },
      }),
      tx.membershipResponse.findFirst({ where: { orgId: org.id, termId, userId } }),
    ])
    const key = member ? { termId_memberId: { termId, memberId: member.id } } : null
    const [payment, arrangement] = key
      ? await Promise.all([
          tx.feePayment.findUnique({ where: key, select: { id: true, status: true } }),
          tx.feeArrangement.findUnique({ where: key, select: { tier: true, amountCents: true } }),
        ])
      : [null, null]
    return { user, form, term, member, response, payment, arrangement }
  })

  const { user, form, term, member, response, payment, arrangement } = context
  if (!user || !term) return { error: 'That form no longer exists.' }
  if (term.closedAt) return { error: 'This term has been banked in, so the form is closed. Speak to the treasurer.' }
  if (!form || form.state !== 'OPEN') return { error: 'This form is not taking responses right now.' }

  const fieldErrors: Record<string, string> = {}
  const questions: Question[] = form.questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label,
    help: q.help,
    required: q.required,
    options: q.options,
  }))
  const read = readAnswers(questions, formData)
  if (!read.ok) Object.assign(fieldErrors, read.errors)

  // Who they are. From the roster when their account is linked to it.
  let fullName = member?.fullName ?? ''
  let studentId = member?.studentId ?? null
  let birthday: { day: number; month: number; year: number | null } | null =
    member?.birthDay && member.birthMonth
      ? { day: member.birthDay, month: member.birthMonth, year: member.birthYear }
      : null

  if (!member) {
    fullName = String(formData.get('fullName') ?? '').trim().replace(/\s+/g, ' ')
    if (fullName.length < 2) fieldErrors.fullName = 'Put in your full name, as on your student card.'
    else if (fullName.length > 120) fieldErrors.fullName = 'That name is longer than we can keep.'

    const fromEmail = studentIdFromEmail(user.email)
    studentId = fromEmail ?? readStudentId(String(formData.get('studentId') ?? ''))
    if (!studentId) fieldErrors.studentId = 'Your student ID is the seven digits on your student card.'

    const typed = readBirthday(
      String(formData.get('birthDay') ?? ''),
      String(formData.get('birthMonth') ?? ''),
      String(formData.get('birthYear') ?? '')
    )
    if (typeof typed === 'string') fieldErrors.birthday = typed
    else birthday = typed
  }

  // Which fee. Not theirs to pick when the exco have set it.
  let tier: FeeTier | null = null
  if (!arrangement && form.tierChoices.length > 0) {
    const picked = String(formData.get('tier') ?? '') as FeeTier
    if (form.tierChoices.includes(picked)) tier = picked
    else fieldErrors.tier = 'Pick how long you are joining for.'
  }

  const resolved: ResolvedFee | null = member
    ? resolveFee({
        payment: null,
        arrangement,
        choice: tier,
        rosterLabel: member.rosterLabel,
        isActive: member.isActive,
        rates: term,
      })
    : null
  const amountCents = resolved ? resolved.amountCents : amountForTier(tier ?? 'FULL', term)
  const owes = (resolved?.charged ?? true) && amountCents > 0

  // Whether this send has to carry a payment. Not when one is already with
  // the exco or confirmed; not when there is nothing to pay.
  // A payment held on a response sent before their account was linked — say
  // they since signed in with their student-ID address — counts, and moves
  // to their row below rather than being asked for twice.
  const heldFromBefore = member && response && !response.memberId && response.heldProofPath ? response : null
  const paidAlready = member
    ? payment?.status === 'CONFIRMED' || payment?.status === 'DECLARED' || heldFromBefore !== null
    : Boolean(response?.heldProofPath)
  const needsPayment = owes && !paidAlready

  let reference: string | null = null
  let bytes: Uint8Array | null = null
  let format: ReturnType<typeof validateProof> | null = null
  if (needsPayment) {
    const parsed = referenceSchema.safeParse(formData.get('reference') ?? '')
    if (!parsed.success) fieldErrors.reference = parsed.error.issues[0]?.message ?? 'Add the payment reference'
    else reference = parsed.data

    const file = formData.get('proof')
    if (!(file instanceof File) || file.size === 0) {
      fieldErrors.proof = 'Attach a screenshot of the PayNow confirmation.'
    } else if (file.size > MAX_PROOF_BYTES) {
      fieldErrors.proof = `That image is over ${MAX_PROOF_BYTES / 1_000_000} MB.`
    } else {
      bytes = new Uint8Array(await file.arrayBuffer())
      try {
        format = validateProof(bytes)
      } catch (error) {
        if (!(error instanceof ProofRejected)) throw error
        fieldErrors.proof = error.message
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'A few things need fixing before this can be sent.', fieldErrors }
  }

  // Answers to questions the exco have since removed are kept: the export and
  // the responses list still show them, and an edit is not a reason to lose one.
  const retired = storedAnswers(response?.answers).filter(
    (answer) => !questions.some((question) => question.id === answer.questionId)
  )
  const answers = [...(read.ok ? read.answers : []), ...retired]
  const proofPath =
    needsPayment && bytes && format
      ? await putProof(term.id, member?.id ?? `unmatched-${userId}`, bytes, format)
      : null

  type Outcome = { problem: string } | { problem: null }
  let outcome: Outcome
  try {
    outcome = await dbAs(userId, async (tx): Promise<Outcome> => {
      await lockTermFees(tx, term.id)
      // Everything read before the lock is read again under it. The upload in
      // between is not instant, and the exco may have closed the form, changed
      // the fee, or put this person on the roster in the meantime.
      const [still, termNow, memberNow, responseNow] = await Promise.all([
        tx.membershipForm.findFirst({ where: { id: form.id }, select: { state: true } }),
        tx.term.findFirst({
          where: { id: term.id },
          select: { closedAt: true, fullFeeCents: true, halfFeeCents: true, exchangeFeeCents: true },
        }),
        tx.member.findFirst({ where: { orgId: org.id, userId }, select: { id: true, rosterLabel: true, isActive: true } }),
        tx.membershipResponse.findFirst({
          where: { orgId: org.id, termId: term.id, userId },
          select: { id: true, memberId: true, heldProofPath: true },
        }),
      ])
      if (still?.state !== 'OPEN' || !termNow || termNow.closedAt) {
        return { problem: 'The exco closed the form a moment ago.' }
      }
      if (
        (memberNow?.id ?? null) !== (member?.id ?? null) ||
        (responseNow?.id ?? null) !== (response?.id ?? null) ||
        (responseNow?.memberId ?? null) !== (response?.memberId ?? null) ||
        (responseNow?.heldProofPath ?? null) !== (response?.heldProofPath ?? null)
      ) {
        return {
          problem: 'Something changed while this was sending — the exco may have just put you on the roster. Reload the page and send it again.',
        }
      }
      const amountNow = member ? amountCents : amountForTier(tier ?? 'FULL', termNow)

      const held =
        !member && proofPath
          ? { heldReference: reference, heldProofPath: proofPath, heldAmountCents: amountNow, heldAt: new Date() }
          : !member && response?.heldProofPath
            ? { heldAmountCents: amountNow }
            : {}
      const fields = {
        email: user.email,
        fullName,
        studentId,
        birthDay: birthday?.day ?? null,
        birthMonth: birthday?.month ?? null,
        birthYear: birthday?.year ?? null,
        tier,
        answers: answers as unknown as Prisma.InputJsonValue,
        ...held,
      }

      const saved = response
        ? await tx.membershipResponse.update({
            where: { id: response.id },
            data: { ...fields, ...(member && !response.memberId ? { memberId: member.id } : {}) },
            select: { id: true },
          })
        : await tx.membershipResponse.create({
            data: { orgId: org.id, termId: term.id, userId, memberId: member?.id ?? null, ...fields },
            select: { id: true },
          })

      if (heldFromBefore && member) {
        const moved = await writeDeclaration(tx, {
          orgId: org.id,
          termId: term.id,
          memberId: member.id,
          declaredByUserId: userId,
          actorId: userId,
          reference: heldFromBefore.heldReference ?? '',
          proofPath: heldFromBefore.heldProofPath!,
          declaredAt: heldFromBefore.heldAt ?? heldFromBefore.submittedAt,
        })
        if (moved.written) {
          await tx.membershipResponse.update({
            where: { id: saved.id },
            data: { heldReference: null, heldProofPath: null, heldAmountCents: null, heldAt: null },
          })
        }
      } else if (member && proofPath && reference) {
        const written = await writeDeclaration(tx, {
          orgId: org.id,
          termId: term.id,
          memberId: member.id,
          declaredByUserId: userId,
          actorId: userId,
          reference,
          proofPath,
        })
        if (!written.written) {
          throw new LateDecision(
            written.reason === 'DECIDED'
              ? 'The exco decided your payment while this was sending. Reload to see what they said.'
              : 'There is nothing to pay any more. Reload to see why.'
          )
        }
      } else if (member && memberNow) {
        // A changed pick reprices a payment still waiting to be checked, so
        // the exco compare the screenshot with what they now owe — priced
        // from what is true under the lock, not from the read before it.
        const key = { termId_memberId: { termId: term.id, memberId: member.id } }
        const [now, arrangementNow] = await Promise.all([
          tx.feePayment.findUnique({ where: key, select: { id: true, status: true } }),
          tx.feeArrangement.findUnique({ where: key, select: { tier: true, amountCents: true } }),
        ])
        const repriced = resolveFee({
          payment: null,
          arrangement: arrangementNow,
          choice: tier,
          rosterLabel: memberNow.rosterLabel,
          isActive: memberNow.isActive,
          rates: termNow,
        })
        if (now?.status === 'DECLARED' && repriced.charged && repriced.amountCents > 0) {
          await tx.feePayment.updateMany({
            where: { id: now.id, status: 'DECLARED' },
            data: { tier: repriced.tier, amountCents: repriced.amountCents },
          })
        }
      }

      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: response ? 'form.response_edit' : 'form.respond',
          targetType: 'MembershipResponse',
          targetId: saved.id,
          // Never the birthday or the answers: the audit log is read more widely.
          after: { termId: term.id, tier, onRoster: Boolean(member), paid: Boolean(proofPath) },
        },
        tx
      )
      return { problem: null }
    })
  } catch (error) {
    if (proofPath) await discardProof(proofPath)
    if (error instanceof LateDecision) return { error: error.message }
    throw error
  }

  if (outcome.problem !== null) {
    if (proofPath) await discardProof(proofPath)
    return { error: outcome.problem }
  }

  revalidateForm(orgSlug)
  return { error: null, ok: true }
}

class LateDecision extends Error {}

// ─── The exco putting a response on the roster ──────────────────────

const matchSchema = z.object({
  responseId: z.string().min(1),
  target: z.string().min(1, 'Pick a roster row, or add them as new'),
})

/**
 * Put a response from somebody who was not linked on the roster.
 *
 * Either against an existing row — the exco know the person, and see why the
 * portal thinks it is them — or as a new member. Their account is linked to
 * the row, and any payment held on the response moves to the row, to be
 * checked like every other.
 */
export async function matchResponse(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId: actorId } = await requirePermission(org.id, 'org.manage_members')

  const parsed = matchSchema.safeParse({
    responseId: formData.get('responseId') ?? '',
    target: formData.get('target') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Pick a roster row' }

  type Outcome = { problem: string } | { problem: null; message: string }
  const outcome = await dbAs(actorId, async (tx): Promise<Outcome> => {
    const found = await tx.membershipResponse.findFirst({
      where: { id: parsed.data.responseId, orgId: org.id },
      select: { termId: true },
    })
    if (!found) return { problem: 'That response has been removed.' }
    await lockTermFees(tx, found.termId)

    const response = await tx.membershipResponse.findFirstOrThrow({ where: { id: parsed.data.responseId } })
    if (response.memberId) return { problem: 'That response is already on the roster.' }

    const membership = await tx.organisationMembership.findUnique({
      where: { userId_orgId: { userId: response.userId, orgId: org.id } },
      select: { isActive: true },
    })
    if (!membership?.isActive) return { problem: 'That account is no longer a member of the club.' }

    const linked = await tx.member.findFirst({ where: { userId: response.userId }, select: { id: true, orgId: true, fullName: true } })

    let memberId: string
    let memberName: string
    if (parsed.data.target === 'NEW') {
      if (linked) {
        return { problem: `That account is already ${linked.fullName} on the roster. Match the response to them.` }
      }
      if (response.studentId) {
        const clash = await tx.member.findFirst({
          where: { orgId: org.id, studentId: response.studentId },
          select: { fullName: true },
        })
        if (clash) {
          return {
            problem: `${clash.fullName} is already on the roster with student ID ${response.studentId}. Match them to that row, or check with both people.`,
          }
        }
      }
      const created = await tx.member.create({
        data: {
          orgId: org.id,
          fullName: response.fullName,
          studentId: response.studentId,
          email: response.email,
          userId: response.userId,
          birthDay: response.birthDay,
          birthMonth: response.birthMonth,
          birthYear: response.birthYear,
        },
        select: { id: true, fullName: true },
      })
      memberId = created.id
      memberName = created.fullName
      await writeAudit(
        {
          orgId: org.id,
          actorId,
          action: 'member.add_from_form',
          targetType: 'Member',
          targetId: created.id,
          after: { fullName: created.fullName, userId: response.userId },
        },
        tx
      )
    } else {
      const member = await tx.member.findFirst({
        where: { id: parsed.data.target, orgId: org.id },
        select: { id: true, fullName: true, userId: true, birthDay: true, birthMonth: true, birthYear: true },
      })
      if (!member) return { problem: 'That roster row no longer exists.' }
      if (member.userId && member.userId !== response.userId) {
        return { problem: `${member.fullName} is already linked to a different account.` }
      }
      if (linked && linked.id !== member.id) {
        return { problem: `That account is already ${linked.fullName} on the roster.` }
      }
      const decided = await tx.feePayment.findFirst({
        where: { memberId: member.id, confirmedByUserId: response.userId },
        select: { id: true },
      })
      if (decided) {
        return {
          problem: 'That account confirmed a payment for this roster row, so linking it would make that its own fee. Undo the payment first.',
        }
      }
      if (!member.userId) {
        await tx.member.update({
          where: { id: member.id },
          data: {
            userId: response.userId,
            // A birthday the roster did not have, from the person themselves.
            ...(!member.birthDay && response.birthDay
              ? { birthDay: response.birthDay, birthMonth: response.birthMonth, birthYear: response.birthYear }
              : {}),
          },
        })
        await writeAudit(
          {
            orgId: org.id,
            actorId,
            action: 'member.link_account',
            targetType: 'Member',
            targetId: member.id,
            after: { userId: response.userId, memberName: member.fullName, via: 'membership form' },
          },
          tx
        )
      }
      memberId = member.id
      memberName = member.fullName
    }

    await tx.membershipResponse.update({
      where: { id: response.id },
      data: { memberId, matchedById: actorId, matchedAt: new Date() },
    })

    let message = `${response.fullName} is on the roster as ${memberName}.`
    if (response.heldProofPath) {
      const moved = await writeDeclaration(tx, {
        orgId: org.id,
        termId: response.termId,
        memberId,
        declaredByUserId: response.userId,
        actorId,
        reference: response.heldReference ?? '',
        proofPath: response.heldProofPath,
        declaredAt: response.heldAt ?? response.submittedAt,
      })
      if (moved.written) {
        await tx.membershipResponse.update({
          where: { id: response.id },
          data: { heldReference: null, heldProofPath: null, heldAmountCents: null, heldAt: null },
        })
        message += ' Their payment is waiting to be checked.'
      } else {
        // Kept on the response, so the screenshot is not lost with the reason.
        message +=
          moved.reason === 'DECIDED'
            ? ' They had already paid, so the payment on their response was not moved. Check whether it was sent twice.'
            : ' They owe nothing this term, so the payment on their response was not moved.'
      }
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId,
        action: 'form.match',
        targetType: 'MembershipResponse',
        targetId: response.id,
        after: { memberId, new: parsed.data.target === 'NEW' },
      },
      tx
    )
    return { problem: null, message }
  })

  if (outcome.problem !== null) return { error: outcome.problem }
  revalidateForm(orgSlug)
  return { error: null, ok: true, message: outcome.message }
}

/**
 * Remove a response — a duplicate, or somebody who is not joining after all.
 * A payment held on it goes with it, screenshot included. A payment already
 * on the roster stays where it is.
 */
export async function removeResponse(orgSlug: string, responseId: string): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const proof = await dbAs(userId, async (tx) => {
    const response = await tx.membershipResponse.findFirst({
      where: { id: responseId, orgId: org.id },
      select: { id: true, termId: true, fullName: true, heldProofPath: true, memberId: true },
    })
    if (!response) return null
    await lockTermFees(tx, response.termId)
    await tx.membershipResponse.delete({ where: { id: response.id } })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.response_remove',
        targetType: 'MembershipResponse',
        targetId: response.id,
        before: { fullName: response.fullName, memberId: response.memberId, heldPayment: Boolean(response.heldProofPath) },
      },
      tx
    )
    return response.heldProofPath
  })

  if (proof) await discardProof(proof)
  revalidateForm(orgSlug)
  return { error: null, ok: true }
}

/**
 * Let go of a payment held on a response that could not move to the roster —
 * somebody who had already paid, or owes nothing. The exco say what they did
 * about the money (refunded, or it was the same payment twice), and it is
 * audited. The screenshot goes with it.
 */
export async function clearHeldPayment(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')
  const responseId = String(formData.get('responseId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length < 3) return { error: 'Say what happened to the money, e.g. refunded on 20 Sep.' }
  if (reason.length > 300) return { error: 'Keep it under 300 characters.' }

  const outcome = await dbAs(userId, async (tx) => {
    const found = await tx.membershipResponse.findFirst({ where: { id: responseId, orgId: org.id }, select: { termId: true } })
    if (!found) return { problem: 'That response has been removed.' }
    await lockTermFees(tx, found.termId)
    const response = await tx.membershipResponse.findFirstOrThrow({ where: { id: responseId } })
    if (!response.heldProofPath) return { problem: null, proof: null }
    if (!response.memberId) return { problem: 'Put them on the roster first. Their payment moves across when you do.' }
    await tx.membershipResponse.update({
      where: { id: response.id },
      data: { heldReference: null, heldProofPath: null, heldAmountCents: null, heldAt: null },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.held_payment_cleared',
        targetType: 'MembershipResponse',
        targetId: response.id,
        before: { amountCents: response.heldAmountCents, reference: response.heldReference },
        after: { reason },
      },
      tx
    )
    return { problem: null, proof: response.heldProofPath }
  })

  if (outcome.problem) return { error: outcome.problem }
  if (outcome.proof) await discardProof(outcome.proof)
  revalidateForm(orgSlug)
  return { error: null, ok: true, message: 'Held payment cleared.' }
}

