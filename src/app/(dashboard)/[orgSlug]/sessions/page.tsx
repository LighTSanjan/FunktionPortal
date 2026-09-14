import Link from 'next/link'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { hasPermission } from '@/core/permissions'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Button } from '@/core/ui/button'
import { listSessions, listInstructorOptions } from '@/modules/coach-claim/queries'
import { MonthNav } from './_components/month-nav'
import { SessionRowCard } from './_components/session-row'

export const dynamic = 'force-dynamic'

export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { orgSlug } = await params
  const { month } = await searchParams
  const { org, membership } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'session.view')
  const { userId } = await verifySession()

  const canManage = hasPermission(membership.role, 'session.manage')
  const { year, monthIndex } = parseMonth(month)
  const from = new Date(Date.UTC(year, monthIndex, 1))
  const to = new Date(Date.UTC(year, monthIndex + 1, 1))

  const [sessions, instructors] = await Promise.all([
    listSessions(userId, org.id, { from, to }),
    listInstructorOptions(userId, org.id),
  ])

  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const label = from.toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        breadcrumbItems={[{ label: org.name, href: `/${orgSlug}/dashboard` }, { label: 'Classes' }]}
        title="Classes"
        subtitle="Every class the club ran, however it got here — entered below, or read in from a trimester attendance sheet under Settings. The invoice and the attendance sheet are both derived from these rows, so this is where a date or a duration is corrected."
        actions={
          canManage && instructors.length > 0 ? (
            <Link href={`/${orgSlug}/sessions/new?month=${monthKey(year, monthIndex)}`}>
              <Button>Record a class</Button>
            </Link>
          ) : undefined
        }
      />

      <MonthNav orgSlug={orgSlug} year={year} monthIndex={monthIndex} />

      {instructors.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">No coaches yet</p>
            <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
              A class has to belong to somebody. Add the coaches who teach the standing
              classes first — their rate is what turns a class into an invoice line.
            </p>
            <Link
              href={`/${orgSlug}/instructors/new`}
              className="inline-block pt-1 text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              Add a coach
            </Link>
          </CardContent>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">Nothing recorded for {label}</p>
            <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
              Classes do not run every week — exam week, recess week and the weeks either side
              of it are all normally blank. If they did run, record them here and the month&rsquo;s
              documents follow from them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 text-[13px] text-text-muted">
            <span>
              <span className="font-semibold text-text tabular-nums">{sessions.length}</span>{' '}
              {sessions.length === 1 ? 'class' : 'classes'} in {label}
            </span>
            <span>
              <span className="font-semibold text-text tabular-nums">
                {(totalMinutes / 60).toFixed(totalMinutes % 60 === 0 ? 0 : 1)}
              </span>{' '}
              hours taught
            </span>
          </div>

          <ul className="space-y-2.5">
            {sessions.map((session, i) => (
              <li key={session.id}>
                <SessionRowCard orgSlug={orgSlug} session={session} delayMs={i * 40} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** `2026-09` from the query string, this month if it is missing or malformed. */
function parseMonth(value: string | undefined): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '')
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    if (month >= 1 && month <= 12) return { year, monthIndex: month - 1 }
  }
  const now = new Date()
  return { year: now.getFullYear(), monthIndex: now.getMonth() }
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}
