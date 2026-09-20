import { getOrgContext } from '@/core/auth/dal'
import { hasPermission } from '@/core/permissions'
import { screenPreviewsEnabled } from '@/core/screen-previews'
import { SettingsNav } from './_components/settings-nav'

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { membership } = await getOrgContext(orgSlug)

  // Filtered here rather than shown and refused on click. Every tab but the
  // profile is exco-only, and a member offered four tabs that answer three
  // permission errors learns nothing except that the portal is broken.
  const tabs = [
    { slug: 'profile', label: 'Profile', permission: null },
    { slug: 'organisation', label: 'Organisation', permission: 'org.manage_settings' },
    // Done once or twice a trimester, and one of two ways into the same
    // records. It was a top-level sidebar entry, level with the month's work.
    { slug: 'attendance', label: 'Attendance import', permission: 'session.manage' },
    { slug: 'access', label: 'Access requests', permission: 'org.manage_members' },
    { slug: 'invitations', label: 'Invitations', permission: 'org.manage_members' },
    { slug: 'audit-log', label: 'Audit Log', permission: 'audit.view' },
    ...(screenPreviewsEnabled()
      ? [{ slug: 'screens', label: 'Screen previews', permission: 'org.manage_settings' }]
      : []),
  ].filter((tab) => tab.permission === null || hasPermission(membership.role, tab.permission))

  return (
    <div className="space-y-6">
      <SettingsNav orgSlug={orgSlug} tabs={tabs.map(({ slug, label }) => ({ slug, label }))} />
      {children}
    </div>
  )
}
