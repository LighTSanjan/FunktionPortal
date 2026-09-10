import Link from 'next/link'
import { Counter } from './counter'

export function StatTile({
  label,
  value,
  suffix,
  href,
  accent,
  delayMs = 0,
}: {
  label: string
  value: number
  suffix?: string
  href?: string
  accent: 'vermilion' | 'marigold' | 'sky' | 'indigo'
  delayMs?: number
}) {
  const inner = (
    <>
      <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text">
        <Counter plain={value} />
        {suffix && <span className="ml-1 text-[13px] font-medium text-text-muted">{suffix}</span>}
      </p>
      <p className="mt-1.5 text-[12px] text-text-muted">{label}</p>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[3px]"
        style={{ background: `var(--brand-${accent})` }}
      />
    </>
  )

  const className =
    'rise-in relative block overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface px-4 py-4'
  const style = { '--delay': `${delayMs}ms` } as React.CSSProperties

  return href ? (
    <Link href={href} className={`${className} lapis-lift`} style={style}>
      {inner}
    </Link>
  ) : (
    <div className={className} style={style}>
      {inner}
    </div>
  )
}
