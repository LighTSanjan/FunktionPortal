import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { listInstructorOptions } from '@/modules/coach-claim/queries'
import { SessionForm } from '../_components/session-form'

export const dynamic = 'force-dynamic'

export default async function NewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { orgSlug } = await params
  const { month } = await searchParams
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'session.manage')
  const { userId } = await verifySession()

  const instructors = await listInstructorOptions(userId, org.id)
  const backTo = `/${orgSlug}/sessions${month ? `?month=${month}` : ''}`

  return (
    <div className="mx-auto max-w-[640px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Classes', href: backTo },
          { label: 'Record a class' },
        ]}
        title="Record a class"
        subtitle="Attendance is marked afterwards, on the class itself."
      />

      <Card>
        <CardContent className="py-6">
          <SessionForm
            orgSlug={orgSlug}
            instructors={instructors}
            defaults={{ heldOn: defaultDate(month) }}
            returnTo={backTo}
          />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Today when recording the current month, otherwise the first of the month
 * being looked at — somebody catching up on June should not have to clear a
 * September date before typing a June one.
 */
function defaultDate(month: string | undefined): string {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (!month || month === thisMonth) return now.toISOString().slice(0, 10)
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : now.toISOString().slice(0, 10)
}
