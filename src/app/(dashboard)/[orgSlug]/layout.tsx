import { verifySession, getOrgContext } from '@/core/auth'
import { hasPermission } from '@/core/permissions'
import { AppShell } from '@/core/ui/shell'
import { getOrgBranding } from '@/core/org/queries'
import { resolveNav } from '@/modules/register'

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
      navEntries={navEntries}
      canManageSettings={canManageSettings}
    >
      {children}
    </AppShell>
  )
}
