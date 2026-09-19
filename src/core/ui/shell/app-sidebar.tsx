'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { isNavEntryActive, type NavGroup } from '@/core/navigation'
import { BRAND } from '@/core/brand'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Home,
  Receipt,
  Users,
  Wallet,
}

const STORAGE_KEY = 'funktion-sidebar-collapsed'

interface AppSidebarProps {
  orgSlug: string
  orgName: string
  navGroups: NavGroup[]
  canManageSettings?: boolean
}

function collapsedSnapshot(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true'
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

function NavIcon({ name }: { name: string }) {
  const Icon = ICONS[name]
  return Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null
}

export function AppSidebar({
  orgSlug,
  orgName,
  navGroups,
  canManageSettings,
}: AppSidebarProps) {
  const pathname = usePathname()
  const collapsed = React.useSyncExternalStore(subscribe, collapsedSnapshot, () => false)

  function toggleCollapse() {
    localStorage.setItem(STORAGE_KEY, String(!collapsed))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  }

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r border-border bg-bg transition-[width] duration-[160ms] ease-out',
        collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]'
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background:
            'linear-gradient(to bottom, var(--brand-vermilion) 0 25%, var(--brand-marigold) 25% 50%, var(--brand-sky) 50% 75%, var(--brand-indigo) 75% 100%)',
        }}
      />

      <div className="flex h-14 items-center border-b border-border px-3">
        <Link
          href={`/${orgSlug}/dashboard`}
          className={cn(
            'flex items-center rounded-[var(--radius-sm)] px-2 py-1 transition-colors hover:bg-surface-hover',
            collapsed && 'justify-center px-0'
          )}
        >
          {/* The club's own logo, not its name in type beside a letter in a
              box. Collapsed, only the F fits. */}
          {collapsed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={BRAND.assets.mark} alt={orgName} className="h-7 w-7" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={BRAND.assets.wordmark} alt={orgName} className="h-11 w-auto" />
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Main navigation">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label ?? 'top'} className={groupIndex > 0 ? 'mt-3' : undefined}>
            {group.label && !collapsed && (
              <h2 className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {group.label}
              </h2>
            )}
            {group.label && collapsed && (
              // Collapsed, a heading has nowhere to go, but the grouping is
              // still information — a rule keeps it.
              <div className="mx-2 mb-1.5 mt-1 border-t border-border" aria-hidden="true" />
            )}
            <ul className="space-y-0.5">
              {group.entries.map((entry) => {
                const href = `/${orgSlug}${entry.href}`
                const active = isNavEntryActive(pathname, href)

                return (
                  <li key={entry.href}>
                    <Link
                      href={href}
                      className={cn(
                        'relative flex min-h-[36px] items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-colors touch-target',
                        active
                          ? 'bg-accent-50 font-semibold text-accent-700'
                          : 'text-text-muted hover:bg-surface-hover hover:text-text',
                        collapsed && 'justify-center px-0'
                      )}
                      title={collapsed ? entry.label : undefined}
                      aria-current={active ? 'page' : undefined}
                    >
                      {active && (
                        <span
                          className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-accent-500"
                          aria-hidden="true"
                        />
                      )}
                      <NavIcon name={entry.icon} />
                      {!collapsed && (
                        <span className="min-w-0 flex-1 truncate">
                          {entry.label}
                          {entry.hint && (
                            <span className="block truncate text-[10.5px] font-normal text-text-subtle">
                              {entry.hint}
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-border px-2 py-2">
        {canManageSettings && (
          <Link
            href={`/${orgSlug}/settings`}
            className={cn(
              'flex min-h-[36px] items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text touch-target',
              pathname.startsWith(`/${orgSlug}/settings`) && 'bg-accent-50 text-accent-700',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>Settings</span>}
          </Link>
        )}

        <button
          onClick={toggleCollapse}
          className={cn(
            'flex min-h-[36px] w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] text-text-subtle transition-colors hover:bg-surface-hover hover:text-text-muted touch-target',
            collapsed && 'justify-center px-0'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>

      </div>
    </aside>
  )
}
