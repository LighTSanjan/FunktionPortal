import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOrgContext, requirePagePermission, verifySession } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { screenPreviewsEnabled } from '@/core/screen-previews'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'

export const dynamic = 'force-dynamic'

interface Screen {
  label: string
  href: string | null
  note?: string
  newTab?: boolean
}

/**
 * Every screen in the portal on one page, for checking how things look.
 *
 * Links open the real pages with this club's real data, so nothing here is a
 * mock-up — and nothing here grants anything: each page still checks who is
 * looking. Pages that need a record link to the most recent one.
 */
export default async function ScreensPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  if (!screenPreviewsEnabled()) notFound()

  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'org.manage_settings')
  const { userId } = await verifySession()

  const sample = await dbAs(userId, async (tx) => ({
    invoice: await tx.invoice.findFirst({ where: { orgId: org.id }, orderBy: { invoiceDate: 'desc' }, select: { id: true } }),
    session: await tx.classSession.findFirst({ where: { orgId: org.id }, orderBy: { heldOn: 'desc' }, select: { id: true } }),
    instructor: await tx.instructor.findFirst({ where: { orgId: org.id }, orderBy: { fullName: 'asc' }, select: { id: true } }),
    import: await tx.attendanceImport.findFirst({ where: { orgId: org.id }, orderBy: { importedAt: 'desc' }, select: { id: true } }),
  }))

  const base = `/${orgSlug}`
  const withRecord = (path: string, id: string | undefined, what: string): Screen =>
    id ? { label: what, href: `${base}/${path}/${id}` } : { label: what, href: null, note: 'nothing to open yet' }

  const groups: Array<{ title: string; blurb: string; screens: Screen[] }> = [
    {
      title: 'What members see',
      blurb: 'You see these with exco extras. Sign in as a member in a private window to see exactly what they get.',
      screens: [
        { label: 'Welcome, for somebody not on the roster yet (saves nothing)', href: `${base}/welcome?preview` },
        { label: 'Home', href: `${base}/dashboard` },
        { label: 'Your membership fee', href: `${base}/fees` },
        { label: 'Ask for exco access', href: `${base}/access` },
        { label: 'Profile and signature', href: `${base}/settings/profile` },
      ],
    },
    {
      title: 'Coach payments',
      blurb: 'The monthly run, from classes to the documents sent to OSL.',
      screens: [
        { label: 'Monthly run board', href: `${base}/monthly-run` },
        withRecord('monthly-run', sample.invoice?.id, 'A month’s documents'),
        sample.invoice
          ? { label: 'A month, print view', href: `${base}/monthly-run/${sample.invoice.id}/print`, newTab: true }
          : { label: 'A month, print view', href: null, note: 'nothing to open yet' },
        { label: 'Classes', href: `${base}/sessions` },
        withRecord('sessions', sample.session?.id, 'A class'),
        { label: 'Add a class', href: `${base}/sessions/new` },
        { label: 'Coaches', href: `${base}/instructors` },
        withRecord('instructors', sample.instructor?.id, 'A coach'),
        { label: 'Add a coach', href: `${base}/instructors/new` },
      ],
    },
    {
      title: 'Membership fees and money',
      blurb: 'The term’s collection and the club’s books.',
      screens: [
        { label: 'Membership fees', href: `${base}/fees/collection` },
        { label: 'Collection summary', href: `${base}/fees/collection/summary` },
        { label: 'Income deposit form, print view', href: `${base}/fees/collection/deposit-form/print`, newTab: true },
        { label: 'Transaction register', href: `${base}/register` },
      ],
    },
    {
      title: 'Settings',
      blurb: 'Done once a term, or when something changes.',
      screens: [
        { label: 'Organisation', href: `${base}/settings/organisation` },
        { label: 'Attendance import', href: `${base}/settings/attendance` },
        withRecord('settings/attendance', sample.import?.id, 'An import'),
        { label: 'Access requests', href: `${base}/settings/access` },
        { label: 'Invitations', href: `${base}/settings/invitations` },
        { label: 'Audit log', href: `${base}/settings/audit-log` },
      ],
    },
    {
      title: 'Signing in',
      blurb: 'These redirect you while you are signed in. Open them in a private window.',
      screens: [
        { label: 'Sign in', href: '/sign-in', newTab: true },
        { label: 'Confirm your email', href: '/verify-email', note: 'only shows for an unconfirmed account' },
        { label: 'Not on the list yet', href: '/onboarding', note: 'only shows without a membership' },
      ],
    },
    {
      title: 'When things go wrong',
      blurb: 'The photos come from src/core/ui/error-faces.ts — add members’ (with their OK) to public/faces/.',
      screens: [
        { label: 'Page not found (404)', href: '/this-page-does-not-exist' },
        { label: 'Record not found', href: `${base}/instructors/not-a-real-coach` },
        { label: 'Crash (500)', href: `${base}/settings/screens/crash` },
        {
          label: 'Page out of step',
          href: `${base}/settings/screens/out-of-step`,
          // Reloading this one throws again by design, so it gets its own tab.
          newTab: true,
          note: 'after a deploy, in a tab left open',
        },
        { label: 'Exco only', href: `${base}/no-access` },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `${base}/dashboard` },
          { label: 'Settings', href: `${base}/settings` },
          { label: 'All screens' },
        ]}
        title="All screens"
        subtitle="Every page in the portal, for looking over. They open with this club’s real data."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardContent className="py-5">
              <h2 className="text-[15px] font-semibold text-text">{group.title}</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{group.blurb}</p>
              <ul className="mt-3 divide-y divide-border">
                {group.screens.map((screen) => (
                  <li key={screen.label} className="flex items-baseline justify-between gap-3 py-2">
                    {screen.href ? (
                      <Link
                        href={screen.href}
                        target={screen.newTab ? '_blank' : undefined}
                        className="text-[13.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
                      >
                        {screen.label}
                      </Link>
                    ) : (
                      <span className="text-[13.5px] text-text-subtle">{screen.label}</span>
                    )}
                    {screen.note && <span className="text-right text-[12px] text-text-subtle">{screen.note}</span>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
