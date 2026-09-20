import { notFound } from 'next/navigation'
import { getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { screenPreviewsEnabled } from '@/core/screen-previews'

export const dynamic = 'force-dynamic'

/** Breaks on purpose, so the exco can see the crash page the way a member would. */
export default async function CrashPreview({ params }: { params: Promise<{ orgSlug: string }> }) {
  if (!screenPreviewsEnabled()) notFound()

  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'org.manage_settings')
  throw new Error('[preview] This page crashed on purpose, to show the error screen.')
}
