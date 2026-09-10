import { notFound } from 'next/navigation'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { getImport } from '@/modules/attendance/queries'
import { DateRow } from '../_components/date-row'
import { ApplyButton } from '../_components/apply-button'

export const dynamic = 'force-dynamic'

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; importId: string }>
}) {
  const { orgSlug, importId } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'session.manage')
  const { userId } = await verifySession()

  const detail = await getImport(userId, org.id, importId)
  if (!detail) notFound()

  const applied = detail.status === 'APPLIED'
  const planned = detail.plan.filter((date) => date.instructorId !== null)
  const skipped = detail.plan.filter((date) => date.instructorId === null)
  const marks = detail.parsed.members.reduce(
    (total, member) =>
      total + member.presentOn.filter((iso) => planned.some((d) => d.iso === iso)).length,
    0
  )

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Attendance import', href: `/${orgSlug}/attendance` },
          { label: detail.sourceTitle ?? 'Sheet' },
        ]}
        title={detail.sourceTitle ?? 'Attendance sheet'}
        subtitle={`${detail.termName ?? 'No term'} · ${detail.dates} class dates · ${detail.rows} roster rows`}
        actions={applied ? <Badge variant="success">Applied</Badge> : undefined}
      />

      {applied && (
        <Note tone="success" title="Already imported">
          {detail.membersCreated} member{detail.membersCreated === 1 ? '' : 's'} created,{' '}
          {detail.sessionsCreated} class{detail.sessionsCreated === 1 ? '' : 'es'} created and{' '}
          {detail.marksImported} attendance mark{detail.marksImported === 1 ? '' : 's'} written.
          Re-reading the same sheet updates these rows rather than adding a second copy.
        </Note>
      )}

      {detail.error && (
        <Note tone="danger" title="The last attempt failed">
          {detail.error}
        </Note>
      )}

      {detail.unknownInstructorLabels.length > 0 && (
        <Note tone="warning" title="A coach in the sheet is not in the portal">
          The sheet names {detail.unknownInstructorLabels.join(', ')}, which matches no instructor
          here. Those dates are left unassigned — add the instructor first, or pick someone below.
        </Note>
      )}

      {detail.parsed.unattributedDates.length > 0 && (
        <Note tone="warning" title="Classes with nobody recorded as teaching">
          {detail.parsed.unattributedDates.length} date
          {detail.parsed.unattributedDates.length === 1 ? '' : 's'} have attendance but no coach
          marked in the sheet — most likely self-practice. A class in the portal has to have a coach
          on it, so these stay out of the import unless you assign one.
        </Note>
      )}

      {detail.parsed.subtotalConflicts.length > 0 && (
        <Note tone="warning" title="The sheet disagrees with itself">
          <p>
            On {detail.parsed.subtotalConflicts.length} cell
            {detail.parsed.subtotalConflicts.length === 1 ? '' : 's'}, a subtotal row does not equal
            the marks above it. The marks are what gets imported — they are what people actually
            ticked — but the sheet&rsquo;s own totals are worth correcting.
          </p>
          <ul className="mt-2 space-y-0.5">
            {detail.parsed.subtotalConflicts.map((conflict) => (
              <li key={`${conflict.label}-${conflict.iso}`} className="tabular-nums">
                {conflict.label} on {conflict.iso}: sheet says {conflict.sheetSays}, marks say{' '}
                {conflict.marksSay}
              </li>
            ))}
          </ul>
        </Note>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-3.5">
            <h2 className="text-[14px] font-semibold text-text">Classes</h2>
            <p className="text-[12.5px] text-text-muted">
              <span className="font-semibold text-text">{planned.length}</span> to import
              {skipped.length > 0 && <span> · {skipped.length} left out</span>}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[10.5px] uppercase tracking-[0.1em] text-text-subtle">
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="py-2.5 font-semibold">Present</th>
                  <th className="py-2.5 font-semibold">Sheet says</th>
                  <th className="py-2.5 pr-5 font-semibold">Coach and length</th>
                </tr>
              </thead>
              <tbody>
                {detail.plan.map((date) => (
                  <DateRow
                    key={date.iso}
                    orgSlug={orgSlug}
                    importId={detail.id}
                    instructors={detail.instructors}
                    locked={applied}
                    {...date}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="text-[14px] font-semibold text-text">Roster</h2>
          <p className="text-[13px] leading-relaxed text-text-muted">
            <Count n={detail.match.matched.length} one="row matches" many="rows match" /> a member
            already in the portal.{' '}
            {detail.match.unmatched.length > 0 ? (
              <>
                <Count n={detail.match.unmatched.length} one="row" many="rows" /> will be added as
                new member{detail.match.unmatched.length === 1 ? '' : 's'}.
              </>
            ) : (
              'Nobody new.'
            )}
          </p>

          {detail.match.unmatched.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {detail.match.unmatched.map((row) => (
                <li
                  key={row.rowNumber}
                  className="rounded-full border border-border px-2.5 py-1 text-[12px] text-text"
                >
                  {row.fullName}
                  <span className="ml-1.5 text-text-subtle">{row.studentId}</span>
                </li>
              ))}
            </ul>
          )}

          {detail.match.unidentifiable.length > 0 && (
            <p className="text-[12.5px] leading-relaxed text-warning">
              <Count n={detail.match.unidentifiable.length} one="row has" many="rows have" /> no
              student ID and cannot be keyed at all
              {': '}
              {detail.match.unidentifiable.map((row) => row.fullName).join(', ')}. Left out — an ID
              in the sheet is what stops the next import creating them a second time.
            </p>
          )}
        </CardContent>
      </Card>

      {detail.parsed.warnings.length > 0 && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <h2 className="text-[14px] font-semibold text-text">Read with corrections</h2>
            <ul className="space-y-1 text-[12.5px] leading-relaxed text-text-muted">
              {detail.parsed.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!applied && (
        <ApplyButton
          orgSlug={orgSlug}
          importId={detail.id}
          classes={planned.length}
          marks={marks}
        />
      )}
    </div>
  )
}

function Count({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <>
      <span className="font-semibold tabular-nums text-text">{n}</span> {n === 1 ? one : many}
    </>
  )
}

function Note({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'warning' | 'danger'
  title: string
  children: React.ReactNode
}) {
  const ink = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' }[tone]
  return (
    <div
      className="rounded-[var(--radius-md)] border border-border bg-surface px-5 py-4"
      style={{ borderLeft: `3px solid ${ink}` }}
    >
      <p className="text-[13px] font-semibold text-text">{title}</p>
      <div className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{children}</div>
    </div>
  )
}
