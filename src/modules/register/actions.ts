'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { RegisterSection } from '@prisma/client'
import { writeAudit } from '@/core/audit'
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
