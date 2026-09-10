'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Settings, X } from 'lucide-react'
import type { NavEntry } from '@/core/navigation'
import { cn } from '@/lib/utils'

interface MobileNavProps {
  orgSlug: string
  orgName: string
  navEntries: NavEntry[]
  canManageSettings?: boolean
}

export function MobileNav(props: MobileNavProps) {
  const pathname = usePathname()
  return <MobileNavInner key={pathname} {...props} pathname={pathname} />
}

function MobileNavInner({
  orgSlug,
  orgName,
  navEntries,
  canManageSettings,
  pathname,
}: MobileNavProps & { pathname: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-hover md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <div
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-border bg-bg">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-[14px] font-semibold text-text">{orgName}</span>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-hover"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Mobile navigation">
              <ul className="space-y-0.5">
                {navEntries.map((entry) => {
                  const href = `/${orgSlug}${entry.href}`
                  const active = pathname === href || pathname.startsWith(`${href}/`)

                  return (
                    <li key={entry.href}>
                      <Link
                        href={href}
                        className={cn(
                          'flex min-h-[44px] items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[14px] font-medium transition-colors',
                          active
                            ? 'bg-accent-50 text-accent-700'
                            : 'text-text-muted hover:bg-surface-hover hover:text-text'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        {entry.label}
                      </Link>
                    </li>
                  )
                })}
                {canManageSettings && (
                  <li>
                    <Link
                      href={`/${orgSlug}/settings`}
                      className={cn(
                        'flex min-h-[44px] items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[14px] font-medium transition-colors',
                        pathname.startsWith(`/${orgSlug}/settings`)
                          ? 'bg-accent-50 text-accent-700'
                          : 'text-text-muted hover:bg-surface-hover hover:text-text'
                      )}
                      aria-current={pathname.startsWith(`/${orgSlug}/settings`) ? 'page' : undefined}
                    >
                      <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Settings
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
