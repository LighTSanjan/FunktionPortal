import Link from 'next/link'
import { AlertTriangle, Clock, Inbox } from 'lucide-react'

export type AlertTone = 'urgent' | 'soon' | 'todo'

export interface DashboardAlert {
  id: string
  tone: AlertTone
  title: string
  detail: string
  href?: string
  cta?: string
}

const TONE = {
  urgent: {
    Icon: AlertTriangle,
    bar: 'var(--brand-vermilion)',
    chip: 'bg-danger/10 text-danger',
    label: 'Now',
  },
  soon: {
    Icon: Clock,
    bar: 'var(--brand-marigold)',
    chip: 'bg-warning/12 text-warning',
    label: 'Soon',
  },
  todo: {
    Icon: Inbox,
    bar: 'var(--brand-sky)',
    chip: 'bg-info/10 text-info',
    label: 'Waiting',
  },
} as const

/**
 * Things that need attention and are not part of either job.
 *
 * It used to say "Nothing needs you right now. Everything with a deadline on
 * it is clear" whenever it had no alerts — while only ever looking at
 * invoices that had already been raised. A month whose classes were recorded
 * and whose documents had never been raised produced no alert at all, so the
 * screen said everything was clear on the 14th. The two workflow cards above
 * carry that state now, and this says nothing when it has nothing to say.
 */
export function Alerts({ alerts, delayMs = 0 }: { alerts: DashboardAlert[]; delayMs?: number }) {
  if (alerts.length === 0) return null

  return (
    <section
      className="rise-in overflow-hidden rounded-[var(--radius-lg)] border border-brand-ink bg-surface"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
      aria-labelledby="dash-alerts"
    >
      <h2
        id="dash-alerts"
        className="border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle"
      >
        Needs you · {alerts.length}
      </h2>
      <ul>
        {alerts.map((alert, i) => {
          const tone = TONE[alert.tone]
          const Body = (
            <div className="flex items-start gap-3.5 px-5 py-3.5">
              <span
                aria-hidden="true"
                className="mt-1 h-8 w-[3px] shrink-0 rounded-full"
                style={{ background: tone.bar }}
              />
              <tone.Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-text-subtle"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-text">{alert.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
                  {alert.detail}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone.chip}`}
              >
                {tone.label}
              </span>
            </div>
          )

          return (
            <li key={alert.id} className={i > 0 ? 'border-t border-border' : undefined}>
              {alert.href ? (
                <Link
                  href={alert.href}
                  className="block transition-colors duration-[var(--dur-1)] hover:bg-surface-hover"
                >
                  {Body}
                </Link>
              ) : (
                Body
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
