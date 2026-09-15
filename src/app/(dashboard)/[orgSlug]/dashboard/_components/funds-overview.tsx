import { formatSgd } from '@/modules/coach-claim/money'
import { Counter } from './counter'
import type { FundView } from './fund-card'

const INK: Record<FundView['source'], string> = {
  SEED: 'var(--brand-vermilion)',
  INCOME: 'var(--brand-sky)',
  DONATION: 'var(--brand-indigo)',
  UNOFFICIAL: 'var(--brand-marigold)',
}

export function FundsOverview({ funds, delayMs = 0 }: { funds: FundView[]; delayMs?: number }) {
  const granted = funds.reduce((sum, f) => sum + f.openingCents, 0)
  const remaining = funds.reduce((sum, f) => sum + f.remainingCents, 0)
  const spent = granted - remaining

  const official = funds.filter((f) => f.source !== 'UNOFFICIAL')
  const unofficial = funds.filter((f) => f.source === 'UNOFFICIAL')
  const officialRemaining = official.reduce((sum, f) => sum + f.remainingCents, 0)
  const unofficialRemaining = unofficial.reduce((sum, f) => sum + f.remainingCents, 0)

  const pct = (cents: number) => (granted > 0 ? Math.max(0, (cents / granted) * 100) : 0)

  return (
    <section
      className="rise-in overflow-hidden rounded-[var(--radius-lg)] border border-brand-ink bg-surface"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
      aria-labelledby="funds-total"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 pb-4 pt-5 sm:px-6">
        <div>
          <h2
            id="funds-total"
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle"
          >
            The club has
          </h2>
          <p className="mt-2 text-[40px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-text">
            <Counter cents={remaining} />
          </p>
          <p className="mt-1.5 text-[13px] text-text-muted">
            left of {formatSgd(granted)} across {funds.length}{' '}
            {funds.length === 1 ? 'fund' : 'funds'}
            {spent > 0 && <> · {formatSgd(spent)} spent or committed</>}
          </p>
        </div>

        <dl className="flex gap-x-8 gap-y-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
              OSL funds
            </dt>
            <dd className="mt-1 text-[19px] font-semibold tabular-nums text-text">
              {formatSgd(officialRemaining)}
            </dd>
          </div>
          {unofficial.length > 0 && (
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
                Unofficial
              </dt>
              <dd className="mt-1 text-[19px] font-semibold tabular-nums text-text">
                {formatSgd(unofficialRemaining)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="px-5 pb-3 sm:px-6">
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-border"
          role="img"
          aria-label={`${formatSgd(remaining)} remaining of ${formatSgd(granted)} across all funds`}
        >
          {funds.map((fund, i) => (
            <span
              key={fund.source}
              className="bar-fill h-full"
              style={
                {
                  width: `${pct(Math.max(0, fund.remainingCents))}%`,
                  background: INK[fund.source],
                  '--delay': `${delayMs + 160 + i * 90}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border px-5 py-3 sm:px-6">
        {funds.map((fund) => (
          <li key={fund.source} className="flex items-center gap-2 text-[12px]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: INK[fund.source] }}
            />
            <span className="text-text-muted">{fund.label}</span>
            <span className="font-semibold tabular-nums text-text">
              {formatSgd(fund.remainingCents)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
