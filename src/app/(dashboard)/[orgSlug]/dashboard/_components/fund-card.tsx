import { formatSgd } from '@/modules/coach-claim/money'
import { Counter } from './counter'

export interface FundView {
  source: 'SEED' | 'INCOME' | 'DONATION' | 'UNOFFICIAL'
  label: string
  wbsElement: string | null
  /**
   * Everything the club was ever able to draw on this fund: the opening
   * balance plus anything paid in since. Not the grant alone — the income
   * fund takes subscriptions during the year, and proportioning its bar
   * against the opening balance would show it as more than 100% full.
   */
  openingCents: number
  priorSpendCents: number
  committedCents: number
  spentCents: number
  remainingCents: number
  rollsOver: boolean
  deadline: Date | null
  note?: string
}

export function FundCard({ fund, delayMs = 0 }: { fund: FundView; delayMs?: number }) {
  const remainingPct =
    fund.openingCents > 0
      ? Math.max(0, Math.min(100, (fund.remainingCents / fund.openingCents) * 100))
      : 0
  const overspent = fund.remainingCents < 0

  return (
    <section
      className="rise-in lapis-lift relative overflow-hidden rounded-[var(--radius-lg)] border border-brand-ink bg-surface p-5"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
            {fund.label}
          </h3>
          {fund.wbsElement ? (
            <p className="mt-1 truncate font-mono text-[10.5px] text-text-subtle">
              {fund.wbsElement}
            </p>
          ) : (
            <p className="mt-1 text-[10.5px] text-text-subtle">Not an OSL fund</p>
          )}
        </div>
        {!fund.rollsOver && (
          <span className="shrink-0 rounded-full bg-brand-marigold/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text">
            Expires
          </span>
        )}
      </div>

      <p
        className={`mt-4 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${
          overspent ? 'text-danger' : 'text-text'
        }`}
      >
        <Counter cents={fund.remainingCents} />
      </p>
      <p className="mt-1.5 text-[12.5px] text-text-muted">
        left of {formatSgd(fund.openingCents)}
      </p>

      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${formatSgd(fund.remainingCents)} of ${formatSgd(fund.openingCents)} remaining`}
      >
        <div
          className="bar-fill h-full rounded-full"
          style={
            {
              width: `${remainingPct}%`,
              '--delay': `${delayMs + 160}ms`,
              background:
                'linear-gradient(90deg, var(--brand-vermilion) 0%, var(--brand-marigold) 34%,' +
                ' var(--brand-sky) 68%, var(--brand-indigo) 100%)',
            } as React.CSSProperties
          }
        />
      </div>

      {fund.spentCents > 0 && (
        <p className="mt-2.5 text-[11.5px] text-text-muted">
          {formatSgd(fund.spentCents)} spent
          {fund.priorSpendCents > 0 && fund.committedCents > 0 && (
            <>
              {' '}
              ({formatSgd(fund.priorSpendCents)} before the portal)
            </>
          )}
          {fund.priorSpendCents > 0 && fund.committedCents === 0 && ' before the portal'}
        </p>
      )}

      {(fund.deadline || fund.note) && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">
          {fund.deadline && (
            <>
              Cut-off{' '}
              <span className="font-medium text-text">
                {fund.deadline.toLocaleDateString('en-SG', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              {fund.note ? '. ' : ''}
            </>
          )}
          {fund.note}
        </p>
      )}
    </section>
  )
}
