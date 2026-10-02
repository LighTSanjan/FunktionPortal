'use server'

/** The exco setting up the term's form: opening it, its wording, who it is for, its questions. */
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { MAX_OPTIONS, needsOptions, parseOptions } from './questions'
import { revalidateForm, type FormActionState } from './action-state'

/** The term's form, made on first touch for a term older than forms. */
async function ensureForm(tx: Prisma.TransactionClient, orgId: string, termId: string) {
  const existing = await tx.membershipForm.findFirst({ where: { orgId, termId } })
  if (existing) return existing
  return tx.membershipForm.create({ data: { orgId, termId } })
}

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
    if (term.closedAt) return `${term.name}’s collection has closed. Its form stays closed.`

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
})

/** The welcome note at the top of the form. */
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
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'That could not be saved' }

  const problem = await dbAs(userId, async (tx) => {
    const term = await tx.term.findFirst({ where: { id: parsed.data.termId, orgId: org.id }, select: { id: true, closedAt: true } })
    if (!term) return 'That term no longer exists.'
    if (term.closedAt) return 'That collection is closed.'
    const form = await ensureForm(tx, org.id, term.id)
    await tx.membershipForm.update({ where: { id: form.id }, data: { intro: parsed.data.intro || null } })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.settings',
        targetType: 'MembershipForm',
        targetId: form.id,
        after: { intro: Boolean(parsed.data.intro) },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidateForm(orgSlug)
  return { error: null, ok: true, message: 'Saved.' }
}

const audienceSchema = z.object({
  termId: z.string().min(1),
  audience: z.enum(['EVERYONE', 'CHOSEN']),
  memberIds: z.array(z.string().min(1)).max(500),
})

/**
 * Who the form is for: everybody, or only the people ticked — the few on a
 * half term, say. Anybody else who opens it is told it is not for them.
 */
export async function saveAudience(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = audienceSchema.safeParse({
    termId: formData.get('termId') ?? '',
    audience: formData.get('audience') ?? '',
    memberIds: formData.getAll('memberId').map(String),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Pick who the form is for' }
  const { termId, audience } = parsed.data
  const memberIds = [...new Set(parsed.data.memberIds)]
  if (audience === 'CHOSEN' && memberIds.length === 0) {
    return { error: 'Tick at least one person, or send it to everyone.' }
  }

  const outcome = await dbAs(userId, async (tx) => {
    const term = await tx.term.findFirst({ where: { id: termId, orgId: org.id }, select: { id: true, closedAt: true } })
    if (!term) return { problem: 'That term no longer exists.' }
    if (term.closedAt) return { problem: 'That collection is closed.' }
    const form = await ensureForm(tx, org.id, term.id)

    if (audience === 'CHOSEN') {
      const found = await tx.member.count({ where: { orgId: org.id, id: { in: memberIds } } })
      if (found !== memberIds.length) return { problem: 'Somebody on that list is no longer on the roster. Reload the page.' }
    }

    await tx.membershipFormRecipient.deleteMany({ where: { formId: form.id } })
    if (audience === 'CHOSEN') {
      await tx.membershipFormRecipient.createMany({
        data: memberIds.map((memberId) => ({ formId: form.id, memberId, orgId: org.id })),
      })
    }
    await tx.membershipForm.update({ where: { id: form.id }, data: { audience } })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.audience',
        targetType: 'MembershipForm',
        targetId: form.id,
        after: { audience, people: audience === 'CHOSEN' ? memberIds.length : null },
      },
      tx
    )
    return { problem: null }
  })

  if (outcome.problem) return { error: outcome.problem }
  revalidateForm(orgSlug)
  return {
    error: null,
    ok: true,
    message: audience === 'EVERYONE' ? 'The form is for everyone.' : `The form is for ${memberIds.length} ${memberIds.length === 1 ? 'person' : 'people'}.`,
  }
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
