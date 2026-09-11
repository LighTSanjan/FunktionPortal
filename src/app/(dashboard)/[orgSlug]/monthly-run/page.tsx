import Link from 'next/link'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { getMonthlyRun } from '@/modules/coach-claim/monthly-run'
import { formatSgd } from '@/modules/coach-claim/money'
import { coachPaymentsWorkflow } from '@/modules/workflow/coach-payments'
import { WorkflowStrip } from '@/modules/workflow/ui'
import { MonthNav } from '../sessions/_components/month-nav'
import { RunCard } from './_components/run-card'

export const dynamic = 'force-dynamic'

export default async function MonthlyRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { orgSlug } = await params
  const { month } = await searchParams
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'claim.generate')
  const { userId } = await verifySession()

  // Claims cover completed months, so the default is last month.
  const { year, monthIndex } = parseMonth(month)
  const run = await getMonthlyRun(userId, org.id, year, monthIndex + 1)

  // The same progress the home screen shows, on the screen that advances it.
  // Arriving here from a bookmark or the back button should still answer
  // where in the sequence you are.
  const workflow = await coachPaymentsWorkflow(userId, org.id, orgSlug, new Date())

  const funds = await dbAs(userId, (tx) =>
    tx.fundAccount.findMany({
      where: { orgId: org.id },
      select: { source: true, openingBalanceCents: true },
      orderBy: { source: 'asc' },
    })
  )

  const period = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-SG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const active = run.entries.filter((e) => e.status !== 'NO_SESSIONS')
  const idle = run.entries.filter((e) => e.status === 'NO_SESSIONS')
  const owed = active
    .filter((e) => e.status !== 'VOID')
    .reduce((sum, e) => sum + e.subtotalCents, 0)

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Coach payments' },
        ]}
        title="Coach payments"
        subtitle="One invoice and one attendance sheet per coach, both due at OSL by the 15th of the following month. Both are built from the classes recorded for the month, so they cannot disagree."
      />

      <WorkflowStrip workflow={workflow} />

      <MonthNav orgSlug={orgSlug} year={year} monthIndex={monthIndex} basePath="monthly-run" />

      {active.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 text-[13px] text-text-muted">
          <span>
            <span className="font-semibold tabular-nums text-text">{active.length}</span>{' '}
            {active.length === 1 ? 'coach' : 'coaches'} taught in {label}
          </span>
          <span>
            <span className="font-semibold tabular-nums text-text">{formatSgd(owed)}</span> in
            claims
          </span>
        </div>
      )}

      {run.rosterSize === 0 && (
        <Card>
          <CardContent className="py-4 text-[13px] leading-relaxed text-text-muted">
            The roster is empty, so the attendance sheet will have dates and no names on it. The
            invoice is unaffected — it is derived from the classes, not from who turned up — but
            OSL expect the sheet to show the club.
          </CardContent>
        </Card>
      )}

      {run.entries.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">No coaches yet</p>
            <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
              There is nothing to claim until somebody is being paid to teach.
            </p>
            <Link
              href={`/${orgSlug}/instructors/new`}
              className="inline-block pt-1 text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              Add a coach
            </Link>
          </CardContent>
        </Card>
      ) : active.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">No classes recorded in {label}</p>
            <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
              Nothing can be claimed for a month with no classes in it. If classes did run,
              record them first — everything on this page is derived from them.
            </p>
            <Link
              href={`/${orgSlug}/sessions?month=${period}`}
              className="inline-block pt-1 text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              Record {label}&rsquo;s classes
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {active.map((entry, i) => (
            <li key={entry.instructorId}>
              <RunCard
                orgSlug={orgSlug}
                period={period}
                entry={entry}
                funds={funds.map((f) => ({
                  source: f.source,
                  openingBalanceCents: f.openingBalanceCents,
                }))}
                delayMs={i * 60}
              />
            </li>
          ))}
        </ul>
      )}

      {idle.length > 0 && (
        <p className="px-1 text-[12.5px] leading-relaxed text-text-subtle">
          No classes in {label} for {idle.map((e) => e.fullName).join(', ')}. If that is wrong,{' '}
          <Link
            href={`/${orgSlug}/sessions?month=${period}`}
            className="font-medium text-accent-600 underline-offset-4 hover:underline"
          >
            check the month&rsquo;s classes
          </Link>
          .
        </p>
      )}
    </div>
  )
}

function parseMonth(value: string | undefined): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '')
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    if (month >= 1 && month <= 12) return { year, monthIndex: month - 1 }
  }
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: previous.getFullYear(), monthIndex: previous.getMonth() }
}
