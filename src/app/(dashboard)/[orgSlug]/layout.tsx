import { verifySession, getOrgContext } from '@/core/auth/dal'
import { AppShell } from '@/core/ui/shell'
import { resolveNavGroups } from '@/modules/register'
import { loadPortalNotifications } from '@/core/notifications/load'
import { getStanding } from '@/core/auth/standing'
import type { NavGroup } from '@/core/navigation'
import { photoUrl } from '@/modules/photos'

const JOINING_NAV: NavGroup[] = [
  {
    label: null,
    entries: [
      { label: 'Welcome', href: '/welcome', icon: 'Home', permission: 'fee.declare' },
      { label: 'Join and pay', href: '/fees', icon: 'Wallet', permission: 'fee.declare' },
    ],
  },
]

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

  // Not on the roster yet: the welcome screen and the join-and-pay form are
  // the only places they can go, so they are the only places offered.
  const standing = await getStanding(orgSlug)
  const navGroups = standing === 'FULL' ? resolveNavGroups(membership.role) : JOINING_NAV
  const navEntries = navGroups.flatMap((group) => group.entries)

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
      userPhoto={photoUrl(session.photoPath)}
      navGroups={navGroups}
      navEntries={navEntries}
      // Everybody has a profile to keep; the exco tabs are filtered inside.
      showSettings
      notifications={notifications}
    >
      {children}
    </AppShell>
  )
}
