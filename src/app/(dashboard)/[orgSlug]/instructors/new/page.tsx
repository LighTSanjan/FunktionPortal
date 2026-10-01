import { getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { InstructorForm } from '../_components/instructor-form'

export const dynamic = 'force-dynamic'

export default async function NewInstructorPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'instructor.manage')

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Coaches', href: `/${orgSlug}/instructors` },
          { label: 'Add' },
        ]}
        title="Add a coach"
        subtitle="The rate is set once they exist — a rate needs somebody to attach to."
      />

      <InstructorForm
        orgSlug={orgSlug}
        values={{
          id: null,
          fullName: '',
          shortCode: '',
          danceStyle: '',
          email: '',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          postalCode: '',
          bankName: '',
          bankAccountNo: '',
          engagement: 'CONTRACTED',
          contractRef: '',
        }}
      />
    </div>
  )
}
