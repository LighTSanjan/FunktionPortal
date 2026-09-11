'use client'

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

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Settings sections">
      {tabs.map((tab) => {
        const href = `/${orgSlug}/settings/${tab.slug}`
        const active = pathname === href
        return (
          <Link
            key={tab.slug}
            href={href}
            className={cn(
              'px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors',
              active
                ? 'border-accent-500 text-text'
                : 'border-transparent text-text-muted hover:text-text hover:border-border'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
