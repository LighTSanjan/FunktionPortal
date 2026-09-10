import Link from 'next/link'
import { formatSgd, sessionAmountCents, formatHours } from '@/modules/coach-claim/money'
import type { SessionRow } from '@/modules/coach-claim/queries'

export function SessionRowCard({
  orgSlug,
  session,
  delayMs = 0,
}: {
  orgSlug: string
  session: SessionRow
  delayMs?: number
}) {
  const amount =
    session.rateCents !== null
      ? sessionAmountCents(session.durationMinutes, session.rateCents)
      : null

  return (
    <Link
      href={`/${orgSlug}/sessions/${session.id}`}
      className="rise-in lapis-lift block rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3.5"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[var(--radius-sm)] border border-brand-ink bg-paper">
            <span className="text-[15px] font-semibold leading-none tabular-nums text-text">
              {session.heldOn.getUTCDate()}
            </span>
            <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-text-subtle">
              {session.heldOn.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'UTC' })}
            </span>
          </div>

          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-text">{session.instructorName}</p>
            <p className="text-[12.5px] text-text-muted">
              {formatHours(session.durationMinutes)} hr
              {amount !== null ? ` · ${formatSgd(amount)}` : ' · no rate for this date'}
              {session.fromImport && ' · imported'}
            </p>
          </div>
        </div>

        <div className="text-right">
          {session.markedCount === 0 ? (
            <span className="text-[12.5px] text-text-subtle">Attendance not marked</span>
          ) : (
            <span className="text-[12.5px] text-text-muted">
              <span className="font-semibold tabular-nums text-text">{session.presentCount}</span>{' '}
              of {session.markedCount} present
            </span>
          )}
        </div>
      </div>

      {session.notes && (
        <p className="mt-2 border-l-2 border-border pl-2.5 text-[12.5px] text-text-muted">
          {session.notes}
        </p>
      )}
    </Link>
  )
}
