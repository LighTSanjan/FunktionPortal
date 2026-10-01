'use server'

/** A member sending the form, and paying with it. */
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { amountForTier, resolveFee, type ResolvedFee } from '@/modules/fees/tiers'
import { lockTermFees, writeDeclaration } from '@/modules/fees/declaration'
import { validateProof, putProof, discardProof, ProofRejected, MAX_PROOF_BYTES } from '@/modules/fees/proof'
import { readAnswers, readStudentId, storedAnswers, type Question } from './questions'
import { revalidateForm, type FormActionState } from './action-state'

class LateDecision extends Error {}

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
 * Everybody confirms the pre-filled name and student ID, and can correct them
 * before sending. Somebody not linked can still pay in the same sitting; the payment is held on
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
      tx.user.findUnique({
        where: { id: userId },
        select: { email: true, birthDay: true, birthMonth: true, birthYear: true, graduationYear: true },
      }),
      tx.membershipForm.findFirst({
        where: { orgId: org.id, termId },
        include: { questions: { orderBy: { position: 'asc' } }, recipients: { select: { memberId: true } } },
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
  if (term.closedAt) return { error: 'This term’s collection has closed, so the form has too. Speak to the treasurer.' }
  if (!form || form.state !== 'OPEN') return { error: 'This form is not taking responses right now.' }
  if (form.audience === 'CHOSEN' && !(member && form.recipients.some((row) => row.memberId === member.id))) {
    return { error: 'This form was sent to particular people, and you aren’t one of them. Speak to the treasurer if you think you should be.' }
  }

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

  // Signed-in identity is only a default. The response keeps what the person
  // confirmed, so a stale roster spelling or student ID can be corrected and
  // shown to the exco without silently rewriting the roster itself.
  const fullName = String(formData.get('fullName') ?? '').trim().replace(/\s+/g, ' ')
  if (fullName.length < 2) fieldErrors.fullName = 'Put in your full name, as on your student card.'
  else if (fullName.length > 120) fieldErrors.fullName = 'That name is longer than we can keep.'

  const studentId = readStudentId(String(formData.get('studentId') ?? ''))
  if (!studentId) fieldErrors.studentId = 'Your student ID is the seven digits on your student card.'

  // The fee is never theirs to pick: the term's rate, or what the exco set
  // for this person. Somebody not on the roster yet is asked for a full term
  // until the exco say otherwise.
  const resolved: ResolvedFee | null = member
    ? resolveFee({
        payment: null,
        arrangement,
        rosterLabel: member.rosterLabel,
        isActive: member.isActive,
        rates: term,
      })
    : null
  const amountCents = resolved ? resolved.amountCents : amountForTier('FULL', term)
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
      const amountNow = member ? amountCents : amountForTier('FULL', termNow)

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
        // What they gave on the welcome screen, so the exco have it when they
        // add somebody new to the roster.
        birthDay: user.birthDay,
        birthMonth: user.birthMonth,
        birthYear: user.birthYear,
        graduationYear: user.graduationYear,
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
          // Never the answers: the audit log is read more widely.
          after: { termId: term.id, onRoster: Boolean(member), paid: Boolean(proofPath) },
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
