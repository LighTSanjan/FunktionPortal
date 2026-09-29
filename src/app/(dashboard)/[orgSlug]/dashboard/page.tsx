import Link from 'next/link'
import { verifySession, getOrgContext } from '@/core/auth/dal'
import { requireFullMember } from '@/core/auth/standing'
import { hasPermission } from '@/core/permissions'
import { dbAs } from '@/core/db'
import { countPendingRequests, getMembership, OFFICE_LABELS } from '@/core/access'
import { loadLedger, SECTION_FUND, SECTION_LABEL } from '@/core/register'
import { rateForDate } from '@/modules/coach-claim/rates'
import { financialYearOf } from '@/modules/references/format'
import { fundBalances } from '@/modules/funds/balance'
import { formatSgd } from '@/modules/coach-claim/money'
import { coachPaymentsWorkflow } from '@/modules/workflow/coach-payments'
import { subscriptionWorkflow } from '@/modules/workflow/subscription'
import { WorkflowCard } from '@/modules/workflow/ui'
import { Hero } from './_components/hero'
import { OwnSubscription } from './_components/own-subscription'
import { getOwnFee } from '@/modules/fees/queries'
import { FundCard, type FundView } from './_components/fund-card'
import { FundsOverview } from './_components/funds-overview'
import { SpendRing } from './_components/spend-ring'
import { RecentTransactions, type LedgerRow } from './_components/recent-transactions'
import { Alerts, type DashboardAlert } from './_components/alerts'
import { StatTile } from './_components/stat-tile'
import { InstructorCard } from '../_components/instructor-card'

export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, membership } = await getOrgContext(orgSlug)
  const { userId, name } = await verifySession()
  await requireFullMember(orgSlug)

  const isExco = membership.role === 'EXCO'
  const canSeeInstructors = hasPermission(membership.role, 'instructor.view')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Derived from today, never a constant.
  //
  // It was 2026, which would have gone on quietly showing FY2026's balances
  // to the exco that took over in April 2027 — the one moment somebody most
  // needs to see that the new year has nothing in it yet. Where the new year
  // has no fund accounts, the most recent year that does is shown instead,
  // and the hero says which year it is looking at.
  const currentYear = financialYearOf(now)

  // Two reads that do not wait on each other. A member's home screen is their
  // own fee and the term, and it no longer pays for the exco's finance,
  // coach and workflow queries first. The exco's figures stay together on
  // one RLS-scoped connection, in parallel with the workflows and the ledger
  // rather than ahead of them.
  const excoData = async () =>
    dbAs(userId, async (tx) => {
      const openYears = await tx.fundAccount.findMany({
        where: { orgId: org.id, financialYear: { lte: currentYear } },
        distinct: ['financialYear'],
        select: { financialYear: true },
        orderBy: { financialYear: 'desc' },
        take: 1,
      })
      const financialYear = openYears[0]?.financialYear ?? currentYear

      return {
        financialYear,
        // The same balances the attendance sheet prints and the fund picker
        // offers: this year's register, plus what the portal banked and raised
        // in this year only.
        funds: await fundBalances(tx, org.id, financialYear),
        overdueInvoices: await tx.invoice.count({
          where: {
            orgId: org.id,
            status: { in: ['GENERATED', 'SIGNED'] },
            submittedToOslAt: null,
            submissionDueAt: { lt: now },
          },
        }),
        memberCount: await tx.member.count({ where: { orgId: org.id, isActive: true } }),
        sessionCount: await tx.classSession.count({ where: { orgId: org.id } }),
        sessionsThisMonth: await tx.classSession.count({
          where: { orgId: org.id, heldOn: { gte: monthStart, lt: monthEnd } },
        }),
        // Claims OSL have been sent and have not yet paid. The one number on
        // this page that is money the club is owed rather than money it has.
        awaitingPayment: await tx.invoice.aggregate({
          where: {
            orgId: org.id,
            status: { not: 'VOID' },
            submittedToOslAt: { not: null },
            paidAt: null,
          },
          _count: true,
          _sum: { totalCents: true },
        }),
        // By term, because each alert opens one term's queue. A single count
        // across terms opened the current term, which could be empty while the
        // payments waiting sat in last term's.
        declaredPayments: await tx.feePayment.groupBy({
          by: ['termId'],
          where: { orgId: org.id, status: 'DECLARED' },
          _count: { _all: true },
        }),
        // Accounts that have said which student they are and are waiting on a
        // person to confirm it. Each one is a member who cannot see what they owe.
        pendingClaims: await tx.user.count({
          where: {
            claimedStudentId: { not: null },
            memberships: { some: { orgId: org.id, isActive: true } },
            member: null,
          },
        }),
        // Membership form responses from people not on the roster yet. Any
        // payment they made is held until somebody matches them.
        unmatchedResponses: await tx.membershipResponse.groupBy({
          by: ['termId'],
          where: { orgId: org.id, memberId: null, term: { closedAt: null } },
          _count: { _all: true },
        }),
        termNames: await tx.term.findMany({
          where: { orgId: org.id },
          select: { id: true, name: true, startDate: true },
          orderBy: { startDate: 'asc' },
        }),
      }
    })

  const [shared, exco, instructors, pendingRequests, ownMembership, fullLedger, coachRun, collection, ownFee] =
    await Promise.all([
      dbAs(userId, (tx) =>
        tx.term.findFirst({
          where: { orgId: org.id, startDate: { lte: now }, endDate: { gte: now } },
          select: { name: true },
        })
      ),
      isExco ? excoData() : Promise.resolve(null),
      canSeeInstructors
        ? dbAs(userId, (tx) =>
            tx.instructor.findMany({
              where: { orgId: org.id },
              orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
              include: { rates: { orderBy: { effectiveFrom: 'asc' } } },
            })
          )
        : Promise.resolve([]),
      isExco ? countPendingRequests(org.id) : Promise.resolve(0),
      getMembership(org.id, userId),
      isExco ? loadLedger(userId, org.id) : Promise.resolve([]),
      // The two jobs, resumable. Built from the same rows the screens read,
      // so a step cannot claim to be done when it is not.
      isExco ? coachPaymentsWorkflow(userId, org.id, orgSlug, now) : Promise.resolve(null),
      isExco ? subscriptionWorkflow(userId, org.id, orgSlug, now) : Promise.resolve(null),
      // Everybody's own membership fee, exco included — they pay too.
      getOwnFee(userId, org.id, null),
    ])

  const ledger = fullLedger.slice(0, 6)
  const ledgerCount = fullLedger.length

  const data = {
    financialYear: exco?.financialYear ?? currentYear,
    currentTerm: shared,
    instructors,
    funds: exco?.funds ?? [],
    overdueInvoices: exco?.overdueInvoices ?? 0,
    memberCount: exco?.memberCount ?? 0,
    sessionCount: exco?.sessionCount ?? 0,
    sessionsThisMonth: exco?.sessionsThisMonth ?? 0,
    awaitingPayment: exco?.awaitingPayment ?? { _count: 0, _sum: { totalCents: null } },
    declaredPayments: exco?.declaredPayments ?? [],
    pendingClaims: exco?.pendingClaims ?? 0,
    unmatchedResponses: exco?.unmatchedResponses ?? [],
    termNames: exco?.termNames ?? [],
  }

  const FUND_LABEL: Record<FundView['source'], string> = {
    SEED: 'OSL Seed Fund',
    INCOME: 'Income',
    DONATION: 'Donations',
    UNOFFICIAL: 'Unofficial',
  }

  const funds: FundView[] = data.funds.map((fund) => ({
    source: fund.source,
    label: FUND_LABEL[fund.source],
    wbsElement: fund.source === 'UNOFFICIAL' ? null : fund.wbsElement,
    openingCents: fund.availableCents,
    priorSpendCents: fund.priorSpendCents,
    committedCents: fund.committedCents,
    spentCents: fund.spentCents,
    remainingCents: fund.remainingCents,
    rollsOver: fund.rollsOver,
    deadline: fund.submissionDeadline,
    note:
      fund.source === 'INCOME'
        ? fund.bankedCents > 0
          ? `Membership fees and donations, including ${formatSgd(fund.bankedCents)} banked in through the portal this year. Rolls over.`
          : 'Membership fees and donations. Rolls over.'
        : fund.source === 'UNOFFICIAL'
          ? 'Held by the exco. No OSL invoice may be drawn on it.'
          : undefined,
  }))

  const activeInstructors = data.instructors.filter((row) => row.isActive)
  const blocked = activeInstructors.filter((row) => missingFor(row).length > 0)

  const alerts: DashboardAlert[] = []

  if (data.overdueInvoices > 0) {
    alerts.push({
      id: 'invoices-overdue',
      tone: 'urgent',
      title: `${data.overdueInvoices} invoice${data.overdueInvoices === 1 ? '' : 's'} past the submission window`,
      detail:
        'An invoice has to reach OSL within three working days of its own date. Past that, expect it to come back.',
      href: `/${orgSlug}/monthly-run`,
    })
  }

  for (const fund of funds) {
    if (fund.rollsOver || !fund.deadline) continue
    const remaining = fund.remainingCents
    if (remaining <= 0) continue
    const daysLeft = Math.ceil((fund.deadline.getTime() - now.getTime()) / DAY)
    if (daysLeft < 0) {
      alerts.push({
        id: `fund-${fund.source}-closed`,
        tone: 'urgent',
        title: `${formatSgd(remaining)} of seed fund was never drawn`,
        detail: `The submission window closed on ${fund.deadline.toISOString().slice(0, 10)}. Unspent seed fund does not roll over.`,
      })
    } else if (daysLeft <= 90) {
      alerts.push({
        id: `fund-${fund.source}-closing`,
        tone: daysLeft <= 30 ? 'urgent' : 'soon',
        title: `${formatSgd(remaining)} of seed fund still unspent`,
        detail: `${daysLeft} day${daysLeft === 1 ? '' : 's'} until the submission cut-off. Anything left after that is lost, not carried over.`,
      })
    }
  }

  if (blocked.length > 0) {
    alerts.push({
      id: 'instructors-blocked',
      tone: 'soon',
      title: `${blocked.length} coach${blocked.length === 1 ? '' : 'es'} cannot be invoiced yet`,
      detail: blocked
        .map((row) => `${row.fullName} — no ${missingFor(row).join(', ')}`)
        .join(' · '),
      href: `/${orgSlug}/instructors`,
    })
  }

  if (isExco && pendingRequests > 0) {
    alerts.push({
      id: 'access-requests',
      tone: 'todo',
      title: `${pendingRequests} access request${pendingRequests === 1 ? '' : 's'} waiting`,
      detail: 'Somebody has asked for exco access. Another exco member has to decide it.',
      href: `/${orgSlug}/settings/access`,
    })
  }

  // One alert per term, oldest term first, each opening that term's queue.
  // The term is named only when there is more than one, where it tells them
  // apart.
  const termOrder = new Map(data.termNames.map((term, index) => [term.id, index]))
  const termName = new Map(data.termNames.map((term) => [term.id, term.name]))
  const perTerm = (rows: { termId: string; _count: { _all: number } }[]) =>
    rows
      .filter((row) => row._count._all > 0)
      .sort((a, b) => (termOrder.get(a.termId) ?? 0) - (termOrder.get(b.termId) ?? 0))
      .map((row) => ({
        termId: row.termId,
        count: row._count._all,
        suffix: rows.length > 1 ? ` for ${termName.get(row.termId) ?? 'another term'}` : '',
      }))

  for (const { termId, count, suffix } of isExco ? perTerm(data.declaredPayments) : []) {
    alerts.push({
      id: `payments-declared-${termId}`,
      tone: 'todo',
      title: `${count} membership fee payment${count === 1 ? '' : 's'} to check${suffix}`,
      detail:
        'Members say they have paid and attached their PayNow confirmation. Match each one to the bank statement.',
      href: `/${orgSlug}/fees/collection?term=${termId}&tab=payments&show=check`,
    })
  }

  if (isExco && data.pendingClaims > 0) {
    alerts.push({
      id: 'student-id-claims',
      tone: 'todo',
      title: `${data.pendingClaims} member${data.pendingClaims === 1 ? '' : 's'} waiting to be matched to the roster`,
      detail:
        'They have given their student ID. Each is already matched to a roster row where one carries that ID — confirming takes a click, and until then they cannot see what they owe.',
      href: `/${orgSlug}/fees/collection?tab=responses`,
    })
  }

  for (const { termId, count, suffix } of isExco ? perTerm(data.unmatchedResponses) : []) {
    alerts.push({
      id: `form-responses-unmatched-${termId}`,
      tone: 'todo',
      title: `${count} membership form response${count === 1 ? '' : 's'} to put on the roster${suffix}`,
      detail:
        'People who filled in the form and aren’t linked to the roster yet. Match each to their row, or add them as new — any payment they made is held until you do.',
      href: `/${orgSlug}/fees/collection?term=${termId}&tab=responses`,
    })
  }

  if (isExco && data.sessionsThisMonth === 0 && now.getDate() >= 20) {
    alerts.push({
      id: 'no-sessions',
      tone: 'soon',
      title: 'No classes recorded this month',
      detail:
        'The month is nearly out and nothing has been entered. The invoice and the attendance sheet are both built from these.',
      href: `/${orgSlug}/sessions`,
    })
  }

  const ledgerRows: LedgerRow[] = ledger.map((entry) => ({
    id: entry.id,
    description: entry.description,
    payee: entry.payeeName,
    reference: entry.reference,
    amountCents: entry.amountCents,
    on: entry.documentDate,
    fundSource: SECTION_FUND[entry.section],
    fundLabel: SECTION_LABEL[entry.section],
  }))

  const roleLabel = ownMembership?.office
    ? OFFICE_LABELS[ownMembership.office]
    : isExco
      ? 'Exco'
      : 'Member'

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <Hero
        greetingName={name.split(/\s+/)[0] ?? name}
        orgName={org.name}
        roleLabel={roleLabel}
        termName={data.currentTerm?.name ?? null}
        financialYear={data.financialYear}
        today={now}
      />

      {/* A member's reason to be here, so it comes first for them. */}
      {!isExco && (
        <OwnSubscription
          orgSlug={orgSlug}
          fee={ownFee}
          alwaysShow
          delayMs={30}
        />
      )}

      {isExco && (coachRun || collection) && (
        <section className="space-y-3" aria-labelledby="dash-work">
          <h2
            id="dash-work"
            className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle"
          >
            Your work
          </h2>
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            {coachRun && <WorkflowCard workflow={coachRun} delayMs={40} />}
            {collection && <WorkflowCard workflow={collection} delayMs={80} />}
          </div>
        </section>
      )}

      {/* The exco pay too, but the club's work comes before their own fee —
          and only while it needs them, not as a receipt once paid. */}
      {isExco && (
        <OwnSubscription
          orgSlug={orgSlug}
          fee={ownFee}
          alwaysShow={false}
          delayMs={100}
        />
      )}

      {isExco && !collection && (
        // No term at all. Both the collection screen and the attendance
        // import are read against one, so this is the first thing a new club
        // needs and nothing used to say so.
        <section
          className="rise-in rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface px-5 py-5"
          style={{ '--delay': '80ms' } as React.CSSProperties}
        >
          <p className="text-[14px] font-medium text-text">No term has been opened yet</p>
          <p className="mt-1.5 max-w-[64ch] text-[13px] leading-relaxed text-text-muted">
            Membership fees are collected per term, and the attendance import reads a sheet against
            one — its date headers carry no year. Neither can run until there is a term.
          </p>
          <Link
            href={`/${orgSlug}/fees/collection`}
            className="mt-3 inline-block text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
          >
            Open a term
          </Link>
        </section>
      )}

      {isExco && <Alerts alerts={alerts} delayMs={120} />}

      {isExco && funds.length > 0 && (
        <>
          <FundsOverview funds={funds} delayMs={80} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {funds.map((fund, i) => (
              <FundCard key={fund.source} fund={fund} delayMs={130 + i * 60} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SpendRing funds={funds} delayMs={190} />
            <RecentTransactions
              rows={ledgerRows}
              orgSlug={orgSlug}
              totalCount={ledgerCount}
              delayMs={230}
            />
          </div>
        </>
      )}

      {/* Exco only. Roster size, coach count and money owed by OSL are the
          club's operating figures, not a member's business — and a member
          account is now something anybody can create. */}
      {isExco && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Members on the roster"
          value={data.memberCount}
          accent="vermilion"
          delayMs={200}
        />
        <StatTile
          label="Coaches"
          value={activeInstructors.length}
          href={canSeeInstructors ? `/${orgSlug}/instructors` : undefined}
          accent="marigold"
          delayMs={240}
        />
        <StatTile
          label="Classes this month"
          value={data.sessionsThisMonth}
          suffix={data.sessionCount > 0 ? `of ${data.sessionCount}` : undefined}
          accent="sky"
          delayMs={280}
        />
        <StatTile
          label="Claims waiting on OSL"
          value={data.awaitingPayment._count}
          suffix={
            data.awaitingPayment._sum.totalCents
              ? formatSgd(data.awaitingPayment._sum.totalCents)
              : undefined
          }
          href={`/${orgSlug}/monthly-run`}
          accent="indigo"
          delayMs={320}
        />
      </div>
      )}

      {!isExco && (
        <section
          className="rise-in rounded-[var(--radius-lg)] border border-border bg-surface px-5 py-5"
          style={{ '--delay': '360ms' } as React.CSSProperties}
        >
          <p className="text-[14px] font-medium text-text">You are a member of {org.name}.</p>
          <p className="mt-1.5 max-w-[64ch] text-[13px] leading-relaxed text-text-muted">
            That is everything most people need. If you have taken on a committee post, you can
            ask for your access to be widened — another exco member decides it, never you.
          </p>
          <Link
            href={`/${orgSlug}/access`}
            className="mt-3 inline-block text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
          >
            Ask for exco access
          </Link>
        </section>
      )}

      {canSeeInstructors && data.instructors.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text">
              Who teaches here
            </h2>
            <Link
              href={`/${orgSlug}/instructors`}
              className="text-[12.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              All coaches
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.instructors.slice(0, 10).map((row, i) => (
              <li key={row.id}>
                <InstructorCard
                  href={`/${orgSlug}/instructors/${row.id}`}
                  fullName={row.fullName}
                  danceStyle={row.danceStyle}
                  shortCode={row.shortCode}
                  rateCents={currentRateOrNull(row.rates)}
                  engagement={row.engagement}
                  isActive={row.isActive}
                  missing={missingFor(row)}
                  delayMs={380 + i * 50}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {isExco && data.sessionCount === 0 && (
        <section
          className="rise-in rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface px-5 py-8 text-center"
          style={{ '--delay': '480ms' } as React.CSSProperties}
        >
          <p className="text-[14px] font-medium text-text">No classes recorded yet</p>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
            {activeInstructors.length === 0
              ? 'Add the coaches first, then record the classes they taught. The invoice and the attendance sheet are both derived from those.'
              : 'Record the classes that ran and the portal can raise the month’s invoice and attendance sheet from them.'}
          </p>
          <Link
            href={
              activeInstructors.length === 0
                ? `/${orgSlug}/instructors/new`
                : `/${orgSlug}/sessions`
            }
            className="mt-3 inline-block text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
          >
            {activeInstructors.length === 0 ? 'Add a coach' : 'Record a class'}
          </Link>
        </section>
      )}
    </div>
  )
}

/** Which required fields are still blank. Mirrors missingForInvoice(). */
function missingFor(row: { bankName: string | null; bankAccountNo: string | null; rates: unknown[] }): string[] {
  const missing: string[] = []
  if (!row.bankName?.trim()) missing.push('bank')
  if (!row.bankAccountNo?.trim()) missing.push('account number')
  if (row.rates.length === 0) missing.push('rate')
  return missing
}

/**
 * What they bill at today. rateForDate throws when nothing covers today — a
 * rate that only starts next term is a real state, and it reads here as "no
 * rate yet" rather than taking the page down.
 */
function currentRateOrNull(
  rates: { hourlyRateCents: number; effectiveFrom: Date; note: string | null }[]
): number | null {
  try {
    // `note` is nullable in the row and optional in RateSchedule; the rate
    // resolver never reads it, so it is dropped rather than widened.
    return rateForDate(
      rates.map(({ hourlyRateCents, effectiveFrom }) => ({ hourlyRateCents, effectiveFrom })),
      new Date()
    )
  } catch {
    return null
  }
}
