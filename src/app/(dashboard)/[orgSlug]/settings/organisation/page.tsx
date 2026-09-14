import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { OrgSettingsForm } from './_components/org-settings-form'

export const dynamic = 'force-dynamic'

export default async function OrganisationSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'org.manage_settings')
  const { userId } = await verifySession()

  const settings = await dbAs(userId, (tx) =>
    tx.organisationSettings.findUnique({ where: { orgId: org.id } })
  )

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Settings', href: `/${orgSlug}/settings` },
          { label: 'Organisation' },
        ]}
        title="Organisation"
        subtitle="The facts the portal prints on documents and files them under. None of it is written into the code, so a rebrand, a change of project code or a different student organisation entirely is this form rather than a deployment."
      />

      <Card>
        <CardContent className="py-6">
          <OrgSettingsForm
            orgSlug={orgSlug}
            values={{
              name: org.name,
              tagline: settings?.tagline ?? '',
              institutionShortName: settings?.institutionShortName ?? '',
              submissionEmail: settings?.submissionEmail ?? '',
              billToName: settings?.billToName ?? '',
              billToAddressLines: (settings?.billToAddressLines ?? []).join('\n'),
              projectCode: settings?.projectCode ?? '',
              cluster: settings?.cluster ?? '',
              // Basis points in the database; a percentage on the form,
              // because that is how the guidelines state it.
              gstPercent: String((settings?.gstBasisPoints ?? 900) / 100),
              brandBandColors: (settings?.brandBandColors ?? []).join('\n'),
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
