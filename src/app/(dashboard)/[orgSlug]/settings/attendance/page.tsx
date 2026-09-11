import Link from 'next/link'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { EmptyState } from '@/core/ui/empty-state'
import { listImports, listTerms } from '@/modules/attendance/queries'
import { UploadForm } from './_components/upload-form'

export const dynamic = 'force-dynamic'

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'session.manage')
  const { userId } = await verifySession()

  const [imports, terms] = await Promise.all([
    listImports(userId, org.id),
    listTerms(userId, org.id),
  ])

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Settings', href: `/${orgSlug}/settings` },
          { label: 'Attendance import' },
        ]}
        title="Attendance import"
        subtitle="Read a trimester attendance sheet into the portal. It creates the same classes you would enter by hand under Classes — this is the bulk way in, not a separate step. Nothing is written until you have looked at what it found."
      />

      <Card>
        <CardContent className="py-6">
          {terms.length === 0 ? (
            // Was a sentence and no way out. A sheet's date headers carry no
            // year, so it genuinely cannot be read without a term — which
            // makes this a prerequisite to offer, not a wall.
            <div className="space-y-2">
              <p className="max-w-[64ch] text-[13px] leading-relaxed text-text-muted">
                No terms have been set up yet. A sheet is read against a term, because its date
                headers carry no year — &ldquo;12 Sep&rdquo; needs the term to know which year it
                belongs to.
              </p>
              <Link
                href={`/${orgSlug}/fees/collection`}
                className="inline-block text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
              >
                Open a term first
              </Link>
            </div>
          ) : (
            <UploadForm
              orgSlug={orgSlug}
              terms={terms.map((term) => ({
                id: term.id,
                name: term.name,
                startDate: term.startDate.toISOString().slice(0, 10),
                endDate: term.endDate.toISOString().slice(0, 10),
              }))}
            />
          )}
        </CardContent>
      </Card>

      {imports.length === 0 ? (
        <EmptyState
          title="Nothing imported yet"
          description="Export the attendance tab of a trimester sheet as CSV and read it in above."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {imports.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/${orgSlug}/settings/attendance/${row.id}`}
                    className="lapis-press flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-text">
                        {row.sourceTitle ?? 'Attendance sheet'}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-text-muted">
                        {row.termName ?? 'No term'} · {row.dates} class{row.dates === 1 ? '' : 'es'} ·{' '}
                        {row.rows} roster row{row.rows === 1 ? '' : 's'}
                        {row.status === 'APPLIED' &&
                          ` · ${row.marksImported} mark${row.marksImported === 1 ? '' : 's'} written`}
                      </span>
                    </span>
                    <StatusBadge status={row.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'APPLIED') return <Badge variant="success">Applied</Badge>
  if (status === 'FAILED') return <Badge variant="danger">Failed</Badge>
  return <Badge>Awaiting review</Badge>
}
