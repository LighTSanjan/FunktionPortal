'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { writeAudit } from '@/core/audit'

export interface OrgSettingsState {
  error: string | null
  ok?: boolean
}

/** Blank becomes null, so an emptied field clears rather than storing "". */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()

/** One address or colour per line, blank lines dropped. */
const lines = z
  .string()
  .transform((value) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  )

const settingsSchema = z.object({
  name: z.string().trim().min(2, 'The organisation needs a name').max(120, 'That name is too long'),
  tagline: optionalText,
  institutionShortName: optionalText,
  submissionEmail: z
    .union([z.literal(''), z.string().trim().email('That is not an email address')])
    .transform((value) => value || null),
  billToName: optionalText,
  billToAddressLines: lines,
  // Three digits, because that is the shape of the slot in IV26-XXX-0001 and
  // a reference number with the wrong project code comes back from OSL.
  projectCode: z.string().trim().regex(/^\d{3}$/, 'The project code is three digits'),
  cluster: z.string().trim().min(1, 'A cluster is required').max(40),
  gstPercent: z.coerce
    .number()
    .min(0, 'GST cannot be negative')
    .max(100, 'That is not a GST rate'),
  brandBandColors: lines.pipe(
    z
      .array(z.string().regex(/^[0-9A-Fa-f]{6}$/, 'Each band is six hex digits, no hash'))
      .max(8, 'Eight bands is more than a rule can carry')
  ),
})

/**
 * Everything about the organisation that prints on a document or numbers one.
 *
 * All of it is data rather than constants for the same reason: this portal is
 * meant to outlive one committee and to be usable by a student organisation
 * that is not this one. A rebrand, a change of project code, a campus move or
 * a GST rate change should be a form, not a deployment.
 */
export async function updateOrgSettings(
  orgSlug: string,
  _prev: OrgSettingsState,
  formData: FormData
): Promise<OrgSettingsState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'org.manage_settings')

  const parsed = settingsSchema.safeParse({
    name: formData.get('name') ?? '',
    tagline: formData.get('tagline') ?? '',
    institutionShortName: formData.get('institutionShortName') ?? '',
    submissionEmail: formData.get('submissionEmail') ?? '',
    billToName: formData.get('billToName') ?? '',
    billToAddressLines: formData.get('billToAddressLines') ?? '',
    projectCode: formData.get('projectCode') ?? '',
    cluster: formData.get('cluster') ?? '',
    gstPercent: formData.get('gstPercent') ?? '0',
    brandBandColors: formData.get('brandBandColors') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Those settings are not valid' }
  }

  const { name, gstPercent, ...settings } = parsed.data
  // Stored as basis points: 9% is 900, and 8.5% is 850 rather than a float
  // that has to be trusted to come back out the same way.
  const gstBasisPoints = Math.round(gstPercent * 100)

  await dbAs(userId, async (tx) => {
    const [beforeOrg, beforeSettings] = await Promise.all([
      tx.organisation.findUnique({ where: { id: org.id }, select: { name: true } }),
      tx.organisationSettings.findUnique({ where: { orgId: org.id } }),
    ])

    if (beforeOrg && beforeOrg.name !== name) {
      await tx.organisation.update({ where: { id: org.id }, data: { name } })
    }

    await tx.organisationSettings.upsert({
      where: { orgId: org.id },
      update: { ...settings, gstBasisPoints },
      create: { orgId: org.id, ...settings, gstBasisPoints },
    })

    // Audited because every field here prints on a document that goes to the
    // Office of Finance, or decides the number one is filed under.
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'org.settings_update',
        targetType: 'Organisation',
        targetId: org.id,
        before: {
          name: beforeOrg?.name ?? null,
          projectCode: beforeSettings?.projectCode ?? null,
          cluster: beforeSettings?.cluster ?? null,
          gstBasisPoints: beforeSettings?.gstBasisPoints ?? null,
          submissionEmail: beforeSettings?.submissionEmail ?? null,
        },
        after: {
          name,
          projectCode: settings.projectCode,
          cluster: settings.cluster,
          gstBasisPoints,
          submissionEmail: settings.submissionEmail,
        },
      },
      tx
    )
  })

  revalidatePath(`/${orgSlug}`, 'layout')
  return { error: null, ok: true }
}
