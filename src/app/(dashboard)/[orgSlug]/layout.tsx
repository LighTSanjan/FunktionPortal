import { verifySession, getOrgContext } from '@/core/auth'
import { hasPermission } from '@/core/permissions'
import { AppShell } from '@/core/ui/shell'
import { getOrgBranding } from '@/core/org/queries'
import { resolveNav, resolveNavGroups } from '@/modules/register'

export default async function OrgDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const session = await verifySession()
  const { orgSlug } = await params
  const { org, membership } = await getOrgContext(orgSlug)

  const navGroups = resolveNavGroups(membership.role)
  // Flat, for the mobile sheet and the command palette, which search rather
  // than browse and so have no use for the grouping.
  const navEntries = resolveNav(membership.role)

  const canManageSettings = hasPermission(membership.role, 'org.manage_settings')
  const branding = await getOrgBranding(org.id)

  return (
    <AppShell
      orgSlug={org.slug}
      orgName={org.name}
      orgLogo={branding.logoSignedUrl}
      userName={session.name}
      userEmail={session.email}
      navGroups={navGroups}
      navEntries={navEntries}
      canManageSettings={canManageSettings}
    >
      {children}
    </AppShell>
  )
}
