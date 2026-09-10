import * as React from 'react'
import { Breadcrumb, type BreadcrumbItem } from './breadcrumb'

export interface PageHeaderProps {
  breadcrumbItems: BreadcrumbItem[]
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

function PageHeader({ breadcrumbItems, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="space-y-2">
      <Breadcrumb items={breadcrumbItems} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-text">{title}</h1>
          {/* A short kueh lapis rule under every page title. It is the one
              piece of the club's identity that reaches the working screens —
              the registers and tables below it stay deliberately quiet. */}
          <span
            aria-hidden="true"
            className="mt-1.5 flex h-[3px] w-16 overflow-hidden rounded-full"
          >
            <span className="flex-1" style={{ background: 'var(--brand-vermilion)' }} />
            <span className="flex-1" style={{ background: 'var(--brand-marigold)' }} />
            <span className="flex-1" style={{ background: 'var(--brand-sky)' }} />
            <span className="flex-1" style={{ background: 'var(--brand-indigo)' }} />
          </span>
          {subtitle && (
            <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-text-muted">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export { PageHeader }
