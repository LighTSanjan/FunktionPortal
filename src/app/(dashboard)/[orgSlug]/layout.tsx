import { verifySession, getOrgContext } from '@/core/auth'
import { hasPermission } from '@/core/permissions'
import { AppShell } from '@/core/ui/shell'
import { resolveNavGroups } from '@/modules/register'
import { loadPortalNotifications } from '@/core/notifications/load'

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
  const navEntries = navGroups.flatMap((group) => group.entries)

  const canManageSettings = hasPermission(membership.role, 'org.manage_settings')
  const notifications = await loadPortalNotifications({
    userId: session.userId,
    orgId: org.id,
    orgSlug: org.slug,
    role: membership.role,
  })

  return (
    <AppShell
      orgSlug={org.slug}
      orgName={org.name}
      userName={session.name}
      userEmail={session.email}
      navGroups={navGroups}
      navEntries={navEntries}
      canManageSettings={canManageSettings}
      notifications={notifications}
    >
      {children}
    </AppShell>
  )
}
