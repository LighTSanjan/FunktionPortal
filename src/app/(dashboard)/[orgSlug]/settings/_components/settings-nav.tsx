'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SettingsNavProps {
  orgSlug: string
}

const TABS = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'access', label: 'Access requests' },
  { slug: 'audit-log', label: 'Audit Log' },
]

export function SettingsNav({ orgSlug }: SettingsNavProps) {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Settings sections">
      {TABS.map((tab) => {
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
