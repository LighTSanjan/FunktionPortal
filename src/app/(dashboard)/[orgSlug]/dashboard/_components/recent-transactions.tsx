import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatSgd } from '@/modules/coach-claim/money'
import { FUND_INK } from './spend-ring'
import type { FundView } from './fund-card'

export interface LedgerRow {
  id: string
  description: string
  payee: string | null
  reference: string | null
  /** Positive is money in, negative is money out. */
  amountCents: number
  on: Date | null
  fundSource: FundView['source']
  fundLabel: string
}

export function RecentTransactions({
  rows,
  orgSlug,
  totalCount,
  delayMs = 0,
}: {
  rows: LedgerRow[]
  orgSlug: string
  totalCount: number
  delayMs?: number
}) {
  return (
    <section
      className="rise-in flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-6"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
      aria-labelledby="ledger-heading"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="ledger-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle"
        >
          Latest transactions
        </h2>
        {totalCount > 0 && (
          <span className="text-[11.5px] tabular-nums text-text-subtle">
            {totalCount.toLocaleString('en-SG')} on record
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-[13px] text-text-muted">
          Nothing recorded yet.
        </p>
      ) : (
        <ul className="mt-4 flex-1 divide-y divide-border">
          {rows.map((row) => {
            const isIncome = row.amountCents > 0
            return (
              <li key={row.id} className="flex items-start gap-3 py-3 first:pt-0">
                <span
                  aria-hidden="true"
                  title={row.fundLabel}
                  className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                  style={{ background: FUND_INK[row.fundSource] }}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-snug text-text">{row.description}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-text-subtle">
                    {[
                      row.on?.toLocaleDateString('en-SG', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      }),
                      row.payee,
                      row.reference,
                    ]
                      .filter(Boolean)
                      .join(' · ') || row.fundLabel}
                  </p>
                </div>

                <span
                  className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                    isIncome ? 'text-success' : 'text-text'
                  }`}
                >
                  {isIncome ? '+' : '−'}
                  {formatSgd(Math.abs(row.amountCents))}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <Link
        href={`/${orgSlug}/register`}
        className="mt-4 inline-flex items-center gap-1.5 border-t border-border pt-4 text-[12.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
      >
        The whole register
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  )
}
