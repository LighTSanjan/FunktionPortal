'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { RegisterSection } from '@prisma/client'
import { writeAudit } from '@/core/audit'
import { alert } from '@/core/alerts'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { financialYearOf } from '@/modules/references/format'
import { fromDateColumn } from '@/lib/date-only'

export interface RegisterActionState {
  error: string | null
  ok?: boolean
}

const schema = z.object({
  kind: z.enum(['INCOME', 'EXPENSE']),
  section: z.enum(['SEED_FUND', 'INCOME', 'DONATION', 'UNOFFICIAL']),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the transaction date'),
  description: z.string().trim().min(3, 'Describe the transaction').max(240, 'Keep the description under 240 characters'),
  counterparty: z.string().trim().max(160, 'Keep the name under 160 characters'),
  reference: z.string().trim().max(80, 'Keep the reference under 80 characters'),
  amount: z.coerce.number().positive('The amount must be more than zero').max(10_000_000, 'That amount is too large'),
  submittedToOslAt: z.string(),
  bankedInAt: z.string(),
})

const reversalSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Say why you are making this change. The reason stays in the audit log.')
    .max(500, 'Keep the reason under 500 characters.'),
})

function readDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null
}

/** Add an exceptional money movement that did not originate in another portal workflow. */
export async function createManualRegisterEntry(
  orgSlug: string,
  _prev: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'references.manage')
  const parsed = schema.safeParse({
    kind: formData.get('kind') ?? '',
    section: formData.get('section') ?? '',
    documentDate: formData.get('documentDate') ?? '',
    description: formData.get('description') ?? '',
    counterparty: formData.get('counterparty') ?? '',
    reference: formData.get('reference') ?? '',
    amount: formData.get('amount') ?? '',
    submittedToOslAt: formData.get('submittedToOslAt') ?? '',
    bankedInAt: formData.get('bankedInAt') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the transaction details.' }

  const documentDate = readDate(parsed.data.documentDate)
  const submittedToOslAt = parsed.data.submittedToOslAt ? readDate(parsed.data.submittedToOslAt) : null
  const bankedInAt = parsed.data.bankedInAt ? readDate(parsed.data.bankedInAt) : null
  if (!documentDate || (parsed.data.submittedToOslAt && !submittedToOslAt) || (parsed.data.bankedInAt && !bankedInAt)) {
    return { error: 'One of those dates is not valid.' }
  }

  const amountCents = Math.round(parsed.data.amount * 100)
  const sourceId = randomUUID()
  await dbAs(userId, async (tx) => {
    const entry = await tx.registerEntry.create({
      data: {
        orgId: org.id,
        financialYear: financialYearOf(fromDateColumn(documentDate)),
        section: parsed.data.section as RegisterSection,
        sourceType: 'Manual',
        sourceId,
        referenceNumber: parsed.data.reference || null,
        description: parsed.data.description,
        documentDate,
        payeeName: parsed.data.counterparty || null,
        expenseWithoutGstCents: parsed.data.kind === 'EXPENSE' ? amountCents : null,
        expenseWithGstCents: parsed.data.kind === 'EXPENSE' ? amountCents : null,
        incomeCents: parsed.data.kind === 'INCOME' ? amountCents : null,
        submittedToOslAt,
        bankedInAt,
      },
      select: { id: true },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'register.manual_create',
        targetType: 'RegisterEntry',
        targetId: entry.id,
        after: {
          kind: parsed.data.kind,
          section: parsed.data.section,
          amountCents,
          documentDate: parsed.data.documentDate,
        },
      },
      tx
    )
  })

  revalidatePath(`/${orgSlug}/register`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/**
 * Reverse an exceptional hand-entered row without destroying the original.
 * Imported rows and workflow-generated entries must be corrected at their
 * source, so this deliberately applies to `Manual` rows only.
 */
export async function voidManualRegisterEntry(
  orgSlug: string,
  entryId: string,
  _prev: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'references.manage')
  const parsed = reversalSchema.safeParse({ reason: formData.get('reason') ?? '' })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Say why this is being voided.' }

  const voidedAt = new Date()
  const problem = await dbAs(userId, async (tx) => {
    const entry = await tx.registerEntry.findFirst({
      where: { id: entryId, orgId: org.id, sourceType: 'Manual' },
      select: {
        id: true,
        section: true,
        financialYear: true,
        incomeCents: true,
        expenseWithGstCents: true,
        voidedAt: true,
      },
    })
    if (!entry) return 'That manual transaction no longer exists.'
    if (entry.voidedAt) return 'That transaction is already void.'

    const changed = await tx.registerEntry.updateMany({
      where: { id: entry.id, orgId: org.id, sourceType: 'Manual', voidedAt: null },
      data: { voidedAt, voidedById: userId, voidReason: parsed.data.reason },
    })
    if (changed.count !== 1) return 'Somebody else changed that transaction. Reload to see it.'

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'register.manual_void',
        targetType: 'RegisterEntry',
        targetId: entry.id,
        before: { status: 'ACTIVE' },
        after: {
          status: 'VOID',
          reason: parsed.data.reason,
          section: entry.section,
          financialYear: entry.financialYear,
          direction: entry.incomeCents ? 'INCOME' : 'EXPENSE',
        },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  await alert(
    'financial_entry_voided',
    { club: org.slug, entry: entryId },
    { eventId: `register-void:${entryId}:${voidedAt.toISOString()}` }
  )
  revalidatePath(`/${orgSlug}/register`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/** Restore a voided manual row, again requiring a permanent reason. */
export async function restoreManualRegisterEntry(
  orgSlug: string,
  entryId: string,
  _prev: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'references.manage')
  const parsed = reversalSchema.safeParse({ reason: formData.get('reason') ?? '' })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Say why this is being restored.' }

  const restoredAt = new Date()
  const problem = await dbAs(userId, async (tx) => {
    const entry = await tx.registerEntry.findFirst({
      where: { id: entryId, orgId: org.id, sourceType: 'Manual' },
      select: {
        id: true,
        section: true,
        financialYear: true,
        incomeCents: true,
        voidedAt: true,
        voidedById: true,
        voidReason: true,
      },
    })
    if (!entry) return 'That manual transaction no longer exists.'
    if (!entry.voidedAt) return 'That transaction is already active.'

    const changed = await tx.registerEntry.updateMany({
      where: { id: entry.id, orgId: org.id, sourceType: 'Manual', voidedAt: entry.voidedAt },
      data: { voidedAt: null, voidedById: null, voidReason: null },
    })
    if (changed.count !== 1) return 'Somebody else changed that transaction. Reload to see it.'

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'register.manual_restore',
        targetType: 'RegisterEntry',
        targetId: entry.id,
        before: {
          status: 'VOID',
          voidedAt: entry.voidedAt.toISOString(),
          voidedById: entry.voidedById,
          reason: entry.voidReason,
        },
        after: {
          status: 'ACTIVE',
          reason: parsed.data.reason,
          section: entry.section,
          financialYear: entry.financialYear,
          direction: entry.incomeCents ? 'INCOME' : 'EXPENSE',
        },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  await alert(
    'financial_entry_restored',
    { club: org.slug, entry: entryId },
    { eventId: `register-restore:${entryId}:${restoredAt.toISOString()}` }
  )
  revalidatePath(`/${orgSlug}/register`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}
