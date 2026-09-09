'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SettingsNavProps {
  orgSlug: string
  enabledModules: string[]
}

/**
 * Kernel-owned settings only. A tab gated on `requiresModule` disappears when
 * that module is disabled, so the HR modules this kernel forked from left
 * eight tabs here that could never resolve — silent, because the filter below
 * hid them rather than failing. Finance module tabs get added as those
 * modules land, alongside the module that owns them.
 */
const TABS: Array<{ slug: string; label: string; requiresModule?: string }> = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'audit-log', label: 'Audit Log' },
]

export function SettingsNav({ orgSlug, enabledModules }: SettingsNavProps) {
  const pathname = usePathname()
  const visibleTabs = TABS.filter(
    (tab) => !tab.requiresModule || enabledModules.includes(tab.requiresModule)
  )

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Settings sections">
      {visibleTabs.map((tab) => {
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
