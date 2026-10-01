import { notFound } from 'next/navigation'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { getInstructor } from '@/modules/coach-claim/queries'
import { InstructorForm } from '../_components/instructor-form'
import { RatePanel } from '../_components/rate-panel'

export const dynamic = 'force-dynamic'

export default async function InstructorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; instructorId: string }>
}) {
  const { orgSlug, instructorId } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'instructor.manage')
  const { userId } = await verifySession()

  const instructor = await getInstructor(userId, org.id, instructorId)
  if (!instructor) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Coaches', href: `/${orgSlug}/instructors` },
          { label: instructor.fullName },
        ]}
        title={instructor.fullName}
        subtitle={`${instructor.danceStyle} · ${instructor.engagement === 'GUEST' ? 'Guest' : 'Contracted'}`}
      />

      <InstructorForm
        orgSlug={orgSlug}
        values={{
          id: instructor.id,
          fullName: instructor.fullName,
          shortCode: instructor.shortCode,
          danceStyle: instructor.danceStyle,
          email: instructor.email ?? '',
          phone: instructor.phone ?? '',
          addressLine1: instructor.addressLine1 ?? '',
          addressLine2: instructor.addressLine2 ?? '',
          postalCode: instructor.postalCode ?? '',
          bankName: instructor.bankName ?? '',
          bankAccountNo: instructor.bankAccountNo ?? '',
          engagement: instructor.engagement,
          contractRef: instructor.contractRef ?? '',
        }}
      />

      <RatePanel
        orgSlug={orgSlug}
        instructorId={instructor.id}
        rates={instructor.rates.map((rate) => ({
          hourlyRateCents: rate.hourlyRateCents,
          effectiveFrom: rate.effectiveFrom.toISOString().slice(0, 10),
          note: rate.note ?? null,
        }))}
      />
    </div>
  )
}
