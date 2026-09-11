import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { buildTermSummary } from '@/modules/fees/summary'
import { FeeSummaryPreview } from '@/modules/fees/preview/summary-preview'

export const dynamic = 'force-dynamic'

export default async function TermSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ term?: string }>
}) {
  const { orgSlug } = await params
  const { term: termId } = await searchParams
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'fee.manage')
  const { userId } = await verifySession()

  if (!termId) notFound()
  const data = await buildTermSummary(userId, org.id, org.name, termId)
  if (!data) notFound()

  return (
    <div className="mx-auto max-w-[1080px] space-y-4">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Subscription', href: `/${orgSlug}/fees` },
          { label: data.termName, href: `/${orgSlug}/fees/collection?term=${termId}` },
          { label: 'Summary' },
        ]}
        title={`${data.termName} — who paid`}
        subtitle="The club's own record of a term's collection, and the one artefact the current process has no equivalent of. The Income Deposit Form carries only the total; this is who it came from."
      />

      <Card>
        <CardContent
          data-print="hide"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-[13px]"
        >
          <span className="text-text-subtle">
            Print this page to file it as a PDF, or take the editable file:
          </span>
          <Link
            href={`/${orgSlug}/fees/collection/summary/download?term=${termId}`}
            prefetch={false}
            className="font-medium text-accent-600 underline-offset-4 hover:underline"
          >
            Summary .docx
          </Link>
        </CardContent>
      </Card>

      <FeeSummaryPreview data={data} />
    </div>
  )
}
