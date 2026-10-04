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
  const { orgSlug } = await params
  const [session, { org, membership }] = await Promise.all([verifySession(), getOrgContext(orgSlug)])

  // Not on the roster yet: the welcome screen and the join-and-pay form are
  // the only places they can go, so they are the only places offered.
  // Read alongside the notifications rather than before them.
  const [standing, notifications] = await Promise.all([
    getStanding(orgSlug),
    loadPortalNotifications({
      userId: session.userId,
      orgId: org.id,
      orgSlug: org.slug,
      role: membership.role,
    }),
  ])
  const navGroups = standing === 'FULL' ? resolveNavGroups(membership.role) : JOINING_NAV
  const navEntries = navGroups.flatMap((group) => group.entries)

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
