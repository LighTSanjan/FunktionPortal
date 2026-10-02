import Link from 'next/link'
import { ChevronDown, Landmark } from 'lucide-react'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { dbAs, inTurn } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { getMonthlyRun } from '@/modules/coach-claim/monthly-run'
import { invoiceDateFor } from '@/modules/coach-claim/claim'
import { financialYearOf } from '@/modules/references/format'
import { formatSgd } from '@/modules/coach-claim/money'
import { addWorkingDays, OSL_SUBMISSION_WORKING_DAYS } from '@/modules/coach-claim/deadlines'
import { isoDate, longDate } from '@/modules/coach-claim/theme'
import { fundBalances } from '@/modules/funds/balance'
import { coachPaymentsWorkflow } from '@/modules/workflow/coach-payments'
import { WorkflowStrip } from '@/modules/workflow/ui'
import { MonthNav } from '../sessions/_components/month-nav'
import { RunCard } from './_components/run-card'
import { PaidOutsideToggle } from './_components/paid-outside-toggle'
import { singaporeDay } from '@/lib/date-only'

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
  await requirePagePermission(org, 'claim.generate')
  const { userId } = await verifySession()

  // Claims cover completed months, so the default is last month.
  const { year, monthIndex } = parseMonth(month)
  const run = await getMonthlyRun(userId, org.id, year, monthIndex + 1)

  // The same progress the home screen shows, for the month on screen. It used
  // to describe the oldest unfinished month wherever you were, so the strip
  // and the cards below it could be talking about different months.
  const workflow = await coachPaymentsWorkflow(userId, org.id, orgSlug, new Date(), {
    year,
    month: monthIndex + 1,
  })

  const { settlement, outsidePayments } = await dbAs(userId, async (tx) => {
    const [settlement, outsidePayments] = await inTurn([
      tx.coachMonthSettlement.findUnique({
        where: { orgId_periodYear_periodMonth: { orgId: org.id, periodYear: year, periodMonth: monthIndex + 1 } },
        select: { settledAt: true, settledBy: { select: { name: true } } },
      }),
      tx.registerEntry.findMany({
        where: { orgId: org.id, sourceType: 'CoachPaymentOutside', sourceId: { startsWith: `${year}-${String(monthIndex + 1).padStart(2, '0')}:` } },
        orderBy: { payeeName: 'asc' },
        select: { id: true, payeeName: true, section: true, expenseWithGstCents: true, documentDate: true },
      }),
    ])
    return { settlement, outsidePayments }
  })

  // The financial year the month's documents will be dated in — the same one
  // generateMonthlyDocuments allocates the reference against — and what each
  // fund has left in it, the figure the attendance sheet will print. It
  // offered the opening balance, which said nothing about whether the fund
  // could take another claim.
  const funds = (
    await dbAs(userId, (tx) => fundBalances(tx, org.id, financialYearOf(invoiceDateFor(year, monthIndex + 1))))
  ).filter((fund) => fund.source === 'SEED' || fund.source === 'INCOME')

  const period = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  // One rule, said the way it is counted: dated the 15th, due three working
  // days later. "By the 15th" was a different deadline from the one every
  // card and the home screen count down to.
  const invoiceDate = invoiceDateFor(year, monthIndex + 1)
  const dueAt = addWorkingDays(invoiceDate, OSL_SUBMISSION_WORKING_DAYS)
  const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-SG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const active = run.entries.filter((e) => e.status !== 'NO_SESSIONS')
  const idle = run.entries.filter((e) => e.status === 'NO_SESSIONS')
  const raised = active.filter((e) => e.status !== 'READY' && e.status !== 'BLOCKED')
  const now = new Date()
  const finished =
    year * 12 + monthIndex < now.getFullYear() * 12 + now.getMonth()
  // Offered only for a finished month with coached classes and nothing raised
  // here: that is what a month from before the portal looks like.
  const canMarkOutside = !settlement && finished && active.length > 0 && raised.length === 0
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
        subtitle={`One invoice and one attendance sheet per coach, built from the classes recorded for the month so they cannot disagree. The invoices are dated ${longDate(invoiceDate)} and have to reach OSL within three working days, by ${longDate(dueAt)}.`}
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

      {settlement && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="text-[14px] font-semibold">{label} was paid outside the portal</p>
            <p className="max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
              Marked by {settlement.settledBy?.name ?? 'an exco member'} on{' '}
              {settlement.settledAt.toLocaleDateString('en-SG', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              . It counts as done, and nothing here needs raising for it.
            </p>
            {outsidePayments.length > 0 && (
              <ul className="space-y-1 text-[13px] text-text">
                {outsidePayments.map((payment) => (
                  <li key={payment.id}>
                    <span className="font-medium">{payment.payeeName ?? 'Coach'}</span>{' '}
                    <span className="tabular-nums">{formatSgd(payment.expenseWithGstCents ?? 0)}</span>{' '}
                    <span className="text-text-muted">from {payment.section === 'SEED_FUND' ? 'OSL Seed Fund' : 'Income'}</span>
                  </li>
                ))}
              </ul>
            )}
            <PaidOutsideToggle orgSlug={orgSlug} period={period} label={label} settled />
          </CardContent>
        </Card>
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
      ) : settlement && raised.length === 0 ? null : (
        <ul className="space-y-3">
          {active.map((entry, i) => (
            <li key={entry.instructorId}>
              <RunCard
                orgSlug={orgSlug}
                period={period}
                entry={entry}
                funds={funds.map((f) => ({
                  source: f.source,
                  remainingCents: f.remainingCents,
                }))}
                delayMs={i * 60}
              />
            </li>
          ))}
        </ul>
      )}

      {canMarkOutside && (
        <details className="group overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-text">Were these coaches paid elsewhere?</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                Record it here without creating another invoice or attendance sheet.
              </span>
            </span>
            <span className="hidden rounded-full bg-surface-hover px-2.5 py-1 text-[11px] font-medium text-text-muted sm:inline">
              Exceptional payment
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-border bg-paper/45 px-4 py-4 sm:px-5">
            <PaidOutsideToggle
              orgSlug={orgSlug}
              period={period}
              label={label}
              settled={false}
              coaches={active.map((entry) => ({ id: entry.instructorId, name: entry.fullName, amountCents: entry.subtotalCents }))}
              defaultPaidOn={isoDate(singaporeDay(new Date()))}
            />
          </div>
        </details>
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
