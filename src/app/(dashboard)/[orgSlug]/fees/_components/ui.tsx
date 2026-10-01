/**
 * The handful of pieces every membership fee screen is built from.
 *
 * Padding, heading sizes, notice colours and button styles come from here or
 * from core/ui, never from the screen itself, so every card matches and every
 * control moves the same way under the pointer.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/core/ui/button-variants'

/** A titled section. The one card on these screens. */
export function Panel({
  title,
  description,
  actions,
  children,
  id,
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  id?: string
  className?: string
}) {
  return (
    <section id={id} className={cn('rounded-[var(--radius-md)] border border-border bg-surface p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold leading-snug text-text">{title}</h2>}
            {description && (
              <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

const NOTICE_TONE = {
  success: 'border-success/25 bg-success/8',
  warning: 'border-warning/30 bg-warning/8',
  danger: 'border-danger/25 bg-danger/8',
  info: 'border-border bg-paper',
} as const

/** A sentence the screen needs you to read. One size, four tones. */
export function Notice({
  tone = 'info',
  children,
  action,
  className,
  role,
}: {
  tone?: keyof typeof NOTICE_TONE
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
  role?: 'status' | 'alert'
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-sm)] border px-3.5 py-2.5 text-[13px] leading-relaxed text-text',
        NOTICE_TONE[tone],
        className
      )}
    >
      <div className="min-w-0">{children}</div>
      {action}
    </div>
  )
}

/** A filter or choice pill. Pills choose; tabs go somewhere. */
export function pillClass(active: boolean): string {
  return cn(
    'lapis-press lapis-tap inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium',
    active
      ? 'border-brand-ink bg-paper text-text'
      : 'border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text'
  )
}

/** A link that looks and moves exactly like the Button of the same variant. */
export function linkButtonClass(
  variant: 'primary' | 'secondary' | 'ghost' = 'secondary',
  size: 'sm' | 'md' = 'md'
): string {
  return buttonVariants({ variant, size })
}

/** The dot-and-word for a form's state, the same wherever it appears. */
export function FormStateBadge({
  state,
  banked,
  bankedAs = 'Banked in',
}: {
  state: 'DRAFT' | 'OPEN' | 'CLOSED'
  banked?: boolean
  /** A collection closed with nothing to bank is not "banked in". */
  bankedAs?: string
}) {
  const look = banked
    ? { dot: 'bg-text-subtle', text: bankedAs }
    : state === 'OPEN'
      ? { dot: 'bg-success', text: 'Open for responses' }
      : state === 'CLOSED'
        ? { dot: 'bg-warning', text: 'Closed' }
        : { dot: 'bg-text-subtle', text: 'Draft, not open yet' }
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-text">
      <span aria-hidden className={cn('h-2 w-2 rounded-full', look.dot)} />
      {look.text}
    </span>
  )
}
