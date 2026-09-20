'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SettingsNavProps {
  orgSlug: string
  /** Resolved by the layout, which is where the caller's role is known. */
  tabs: { slug: string; label: string }[]
}

export function SettingsNav({ orgSlug, tabs }: SettingsNavProps) {
  const pathname = usePathname()
  const activeRef = React.useRef<HTMLAnchorElement>(null)

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname])

  return (
    <nav
      className="-mx-4 overflow-x-auto border-b border-border px-4 [scrollbar-width:thin] md:mx-0 md:px-0"
      aria-label="Settings sections"
    >
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const href = `/${orgSlug}/settings/${tab.slug}`
          // Prefix, not equality: the attendance import has a detail page under
          // it, and a tab that unlights when you open what it links to reads as
          // having navigated away from settings altogether.
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={tab.slug}
              ref={active ? activeRef : undefined}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'border-accent-500 text-text'
                  : 'border-transparent text-text-muted hover:border-border hover:text-text'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
