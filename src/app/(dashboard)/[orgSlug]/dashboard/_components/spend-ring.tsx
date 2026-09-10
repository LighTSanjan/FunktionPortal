import { formatSgd } from '@/modules/coach-claim/money'
import type { FundView } from './fund-card'

export const FUND_INK: Record<FundView['source'], string> = {
  SEED: 'var(--brand-vermilion)',
  INCOME: 'var(--brand-sky)',
  DONATION: 'var(--brand-indigo)',
  UNOFFICIAL: 'var(--brand-marigold)',
}

// This small SVG renders on the server and avoids a client-side chart library.
export function SpendRing({ funds, delayMs = 0 }: { funds: FundView[]; delayMs?: number }) {
  const spending = funds.filter((fund) => fund.spentCents > 0)
  const total = spending.reduce((sum, fund) => sum + fund.spentCents, 0)

  const R = 62
  const C = 2 * Math.PI * R
  const GAP = 3

  // Prefix sums rather than a running variable: a mutable accumulator inside
  // a map is a reassignment after render as far as the React compiler is
  // concerned, and there are at most four funds, so the cost of doing it the
  // straightforward way is nothing.
  const shares = spending.map((fund) => (total > 0 ? fund.spentCents / total : 0))
  const arcs = spending.map((fund, i) => ({
    source: fund.source,
    label: fund.label,
    cents: fund.spentCents,
    share: shares[i],
    // Never trim a segment out of existence: a fund with a single small
    // expense still has to be visible, and findable in the legend beside it.
    length: Math.max(2, shares[i] * C - (spending.length > 1 ? GAP : 0)),
    offset: shares.slice(0, i).reduce((sum, share) => sum + share, 0) * C,
  }))

  return (
    <section
      className="rise-in flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-6"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
      aria-labelledby="spend-ring-heading"
    >
      <h2
        id="spend-ring-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle"
      >
        Where it went
      </h2>

      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-[13px] text-text-muted">
          Nothing has been spent yet this year.
        </p>
      ) : (
        <>
          <div className="flex justify-center py-7">
            <div className="relative">
              <svg
                width="164"
                height="164"
                viewBox="0 0 164 164"
                role="img"
                aria-label={`${formatSgd(total)} spent, split across ${arcs.length} funds`}
              >
                <g transform="rotate(-90 82 82)">
                  <circle cx="82" cy="82" r={R} fill="none" stroke="var(--border)" strokeWidth="1" />
                  {arcs.map((arc, i) => (
                    <circle
                      key={arc.source}
                      cx="82"
                      cy="82"
                      r={R}
                      fill="none"
                      stroke={FUND_INK[arc.source]}
                      strokeWidth="20"
                      strokeDasharray={`${arc.length} ${C - arc.length}`}
                      strokeDashoffset={-arc.offset}
                      className="ring-grow"
                      style={{ '--delay': `${delayMs + 160 + i * 110}ms` } as React.CSSProperties}
                    />
                  ))}
                </g>
              </svg>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text">
                  {formatSgd(total)}
                </span>
                <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-subtle">
                  spent
                </span>
              </div>
            </div>
          </div>

          <ul className="mt-auto space-y-0.5 border-t border-border pt-4">
            {arcs.map((arc) => (
              <li key={arc.source} className="flex items-center gap-3 py-1">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: FUND_INK[arc.source] }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">{arc.label}</span>
                <span className="text-[11.5px] tabular-nums text-text-subtle">
                  {Math.round(arc.share * 100)}%
                </span>
                <span className="w-[74px] text-right text-[13px] font-semibold tabular-nums text-text">
                  {formatSgd(arc.cents)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
