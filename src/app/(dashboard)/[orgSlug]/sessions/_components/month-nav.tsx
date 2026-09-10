import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function MonthNav({
  orgSlug,
  year,
  monthIndex,
  basePath = 'sessions',
}: {
  orgSlug: string
  year: number
  monthIndex: number
  basePath?: 'sessions' | 'monthly-run'
}) {
  const key = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`
  const prev = new Date(Date.UTC(year, monthIndex - 1, 1))
  const next = new Date(Date.UTC(year, monthIndex + 1, 1))
  const current = new Date(Date.UTC(year, monthIndex, 1))
  const now = new Date()
  const defaultDate =
    basePath === 'monthly-run' ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now
  const isDefaultMonth =
    year === defaultDate.getFullYear() && monthIndex === defaultDate.getMonth()

  const step =
    'lapis-press lapis-tap inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[13px] font-medium text-text hover:bg-surface-hover'

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Month">
      <Link
        href={`/${orgSlug}/${basePath}?month=${key(prev.getUTCFullYear(), prev.getUTCMonth())}`}
        className={step}
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {prev.toLocaleDateString('en-SG', { month: 'short', timeZone: 'UTC' })}
      </Link>

      <span className="rounded-[var(--radius-sm)] border border-brand-ink bg-paper px-3 py-1.5 text-[13px] font-semibold text-text">
        {current.toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      </span>

      <Link
        href={`/${orgSlug}/${basePath}?month=${key(next.getUTCFullYear(), next.getUTCMonth())}`}
        className={step}
      >
        {next.toLocaleDateString('en-SG', { month: 'short', timeZone: 'UTC' })}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>

      {!isDefaultMonth && (
        <Link
          href={`/${orgSlug}/${basePath}`}
          className="ml-1 text-[12.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
        >
          {basePath === 'monthly-run' ? 'Back to last month' : 'Back to this month'}
        </Link>
      )}
    </nav>
  )
}
