import { getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { ThrowStale } from './throw-stale'

export const dynamic = 'force-dynamic'

/**
 * Shows the reload screen without waiting for a deploy to catch somebody
 * mid-click. It throws in the browser rather than on the server, because
 * that is where the real thing happens — and because a server error reaches
 * the browser as a digest with its message stripped, which would show the
 * crash page here instead. See src/core/ui/stale-client.ts.
 */
export default async function OutOfStepPreview({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'org.manage_settings')
  return <ThrowStale />
}
