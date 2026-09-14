import Link from 'next/link'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Button } from '@/core/ui/button'
import { listInstructors, missingForInvoice } from '@/modules/coach-claim/queries'
import { rateForDate } from '@/modules/coach-claim/rates'
import { InstructorCard } from '../_components/instructor-card'

export const dynamic = 'force-dynamic'

export default async function InstructorsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'instructor.view')
  const { userId } = await verifySession()

  const instructors = await listInstructors(userId, org.id)

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[{ label: org.name, href: `/${orgSlug}/dashboard` }, { label: 'Instructors' }]}
        title="Instructors"
        subtitle="Contracted coaches and guests. Rates, bank details and contract references."
        actions={
          <Link href={`/${orgSlug}/instructors/new`}>
            <Button>Add instructor</Button>
          </Link>
        }
      />

      {instructors.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-8 text-center">
            <p className="font-medium">No instructors yet</p>
            <p className="mx-auto max-w-[52ch] text-[13px] text-text-muted">
              Add the coaches who teach the standing classes. Their rate and bank details are
              what the monthly invoice is built from.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {instructors.map((instructor, i) => (
            <li key={instructor.id}>
              <InstructorCard
                href={`/${orgSlug}/instructors/${instructor.id}`}
                fullName={instructor.fullName}
                danceStyle={instructor.danceStyle}
                shortCode={instructor.shortCode}
                // What they are billing at today, so the card shows the live
                // figure rather than whatever the first contract said.
                rateCents={currentRateOrNull(instructor.rates)}
                engagement={instructor.engagement}
                isActive={instructor.isActive}
                missing={missingForInvoice(instructor)}
                delayMs={i * 45}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function currentRateOrNull(rates: Parameters<typeof rateForDate>[0]): number | null {
  try {
    return rateForDate(rates, new Date())
  } catch {
    return null
  }
}
