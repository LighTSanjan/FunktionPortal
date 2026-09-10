export function AuthCardShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="lapis-plate rounded-[var(--radius-lg)] border border-brand-ink bg-surface p-6 sm:p-8">
      <div className="mb-7">
        <h1 className="text-[27px] font-semibold leading-tight tracking-[-0.02em] text-text">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-[14px] leading-relaxed text-text-muted">{subtitle}</p>
        )}
      </div>

      {children}

      {footer && (
        <div className="mt-7 border-t border-border pt-5 text-[13.5px] text-text-muted">
          {footer}
        </div>
      )}
    </div>
  )
}
