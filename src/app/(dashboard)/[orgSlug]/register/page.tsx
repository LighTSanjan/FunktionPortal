import Link from 'next/link'
import type { RegisterSection } from '@prisma/client'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { formatSgd } from '@/modules/coach-claim/money'
import { loadLedger, filterLedger, ledgerTotals, ledgerYears, SECTION_LABEL, type LedgerEntry } from '@/core/register'
import { FUND_INK } from '../dashboard/_components/spend-ring'
import { SECTION_FUND } from '@/core/register'
import { isoDate } from '@/modules/coach-claim/theme'
import { singaporeDay } from '@/lib/date-only'
import { ManualTransactionForm } from './_components/manual-transaction-form'

export const dynamic = 'force-dynamic'

const SECTIONS: RegisterSection[] = ['SEED_FUND', 'INCOME', 'DONATION', 'UNOFFICIAL']

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ section?: string; year?: string }>
}) {
  const { orgSlug } = await params
  const { section: sectionParam, year: yearParam } = await searchParams
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'references.view')
  const { userId } = await verifySession()

  const section = SECTIONS.includes(sectionParam as RegisterSection)
    ? (sectionParam as RegisterSection)
    : undefined
  const financialYear = /^\d{4}$/.test(yearParam ?? '') ? Number(yearParam) : undefined

  const ledger = await loadLedger(userId, org.id)
  const entries = filterLedger(ledger, { section, financialYear })
  // The cards follow the year filter; the list of years does not, or picking
  // one would remove every other year's chip and strand the reader there.
  const totals = ledgerTotals(ledger, { financialYear })
  const years = ledgerYears(ledger)
  const shown = entries.reduce(
    (acc, entry) => {
      if (entry.amountCents >= 0) acc.in += entry.amountCents
      else acc.out += -entry.amountCents
      return acc
    },
    { in: 0, out: 0 }
  )

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      <PageHeader
        breadcrumbItems={[{ label: org.name, href: `/${orgSlug}/dashboard` }, { label: 'Register' }]}
        title="Transaction register"
        subtitle="Every movement of club money the exco have recorded — the OSL register, the unofficial one the committee keep themselves, and the invoices and bank-ins raised here that aren't on the spreadsheet yet."
      />

      <details className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
        <summary className="cursor-pointer text-[14px] font-semibold text-text">Record a transaction manually</summary>
        <p className="mt-2 max-w-[72ch] text-[12.5px] leading-relaxed text-text-muted">
          Use this for money that did not come through a portal workflow. It appears in the register and updates the matching fund balance immediately.
        </p>
        <div className="mt-5">
          <ManualTransactionForm orgSlug={orgSlug} today={isoDate(singaporeDay(new Date()))} />
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.map((total, i) => (
          <div
            key={total.section}
            className="rise-in relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3.5"
            style={{ '--delay': `${i * 50}ms` } as React.CSSProperties}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
              {SECTION_LABEL[total.section]}
            </p>
            <p className="mt-2 text-[19px] font-semibold leading-none tabular-nums text-text">
              {formatSgd(total.inCents - total.outCents)}
            </p>
            <p className="mt-1.5 text-[11.5px] tabular-nums text-text-muted">
              <span className="text-success">+{formatSgd(total.inCents)}</span>
              {' · '}
              <span>−{formatSgd(total.outCents)}</span>
            </p>
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[3px]"
              style={{ background: FUND_INK[SECTION_FUND[total.section]] }}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <Filter href={`/${orgSlug}/register`} active={!section && !financialYear}>
          Everything
        </Filter>
        {totals.map((total) => (
          <Filter
            key={total.section}
            href={`/${orgSlug}/register?${query({ section: total.section, year: financialYear })}`}
            active={section === total.section}
          >
            {SECTION_LABEL[total.section]}
          </Filter>
        ))}
      </div>

      {years.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] uppercase tracking-wider text-text-subtle">FY</span>
          <Filter
            href={`/${orgSlug}/register?${query({ section })}`}
            active={financialYear === undefined}
            small
          >
            All years
          </Filter>
          {years.map((year) => (
            <Filter
              key={year}
              href={`/${orgSlug}/register?${query({ section, year })}`}
              active={financialYear === year}
              small
            >
              {year}
            </Filter>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-3.5">
            <p className="text-[12.5px] text-text-muted">
              <span className="font-semibold tabular-nums text-text">{entries.length}</span>{' '}
              {entries.length === 1 ? 'row' : 'rows'}
            </p>
            <p className="text-[12.5px] tabular-nums text-text-muted">
              <span className="font-semibold text-success">+{formatSgd(shown.in)}</span> in ·{' '}
              <span className="font-semibold text-text">−{formatSgd(shown.out)}</span> out ·{' '}
              <span className="font-semibold text-text">{formatSgd(shown.in - shown.out)}</span> net
            </p>
          </div>

          {entries.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-text-muted">
              Nothing recorded under that filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-[10.5px] uppercase tracking-[0.1em] text-text-subtle">
                    <th className="px-5 py-2.5 font-semibold">Date</th>
                    <th className="py-2.5 font-semibold">Description</th>
                    <th className="py-2.5 font-semibold">Payee</th>
                    <th className="py-2.5 font-semibold">Reference</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <LedgerRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Keeps whichever of the two filters the reader did not just click. */
function query({ section, year }: { section?: string; year?: number }): string {
  return new URLSearchParams({
    ...(section ? { section } : {}),
    ...(year ? { year: String(year) } : {}),
  }).toString()
}

function Filter({
  href,
  active,
  small,
  children,
}: {
  href: string
  active: boolean
  small?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`lapis-press inline-flex items-center rounded-full border px-3 font-medium transition-colors ${
        small ? 'h-7 text-[12px]' : 'h-8 text-[12.5px]'
      } ${
        active
          ? 'border-brand-ink bg-paper text-text'
          : 'border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text'
      }`}
    >
      {children}
    </Link>
  )
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isIncome = entry.amountCents >= 0

  return (
    <tr className="border-b border-border last:border-0 transition-colors duration-[var(--dur-1)] hover:bg-surface-hover">
      <td className="whitespace-nowrap px-5 py-2.5 align-top text-[12.5px] tabular-nums text-text-muted">
        {entry.documentDate
          ? entry.documentDate.toLocaleDateString('en-SG', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })
          : // The sheet records a term for some rows and nothing at all for
            // others. Saying so beats inventing a date to fill the column.
            <span className="text-text-subtle">FY{entry.financialYear}</span>}
      </td>
      <td className="py-2.5 pr-4 align-top">
        <span className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            title={SECTION_LABEL[entry.section]}
            className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
            style={{ background: FUND_INK[SECTION_FUND[entry.section]] }}
          />
          <span className="text-[13px] leading-snug text-text">{entry.description}</span>
        </span>
      </td>
      <td className="py-2.5 pr-4 align-top text-[12.5px] text-text-muted">
        {entry.payeeName ?? '—'}
      </td>
      <td className="py-2.5 pr-4 align-top font-mono text-[11.5px] text-text-subtle">
        {entry.reference ?? '—'}
        {entry.fromPortal && (
          <span
            title="Raised in the portal and not on the spreadsheet yet. Copy it across when you next update the sheet."
            className="ml-2 rounded-full border border-border px-1.5 py-px font-sans text-[10px] font-medium uppercase tracking-wider text-text-muted"
          >
            Portal
          </span>
        )}
      </td>
      <td
        className={`whitespace-nowrap px-5 py-2.5 text-right align-top text-[13px] font-semibold tabular-nums ${
          isIncome ? 'text-success' : 'text-text'
        }`}
      >
        {isIncome ? '+' : '−'}
        {formatSgd(Math.abs(entry.amountCents))}
      </td>
    </tr>
  )
}
