'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { NavEntry } from '@/core/navigation'
import { Logo } from '@/core/ui/logo'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Receipt,
  Users,
  Wallet,
}

const STORAGE_KEY = 'funktion-sidebar-collapsed'

interface AppSidebarProps {
  orgSlug: string
  orgName: string
  orgLogo?: string | null
  navEntries: NavEntry[]
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
  orgLogo,
  navEntries,
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
            'flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-surface-hover',
            collapsed && 'justify-center px-0'
          )}
        >
          {orgLogo ? (
            // Signed storage URLs are dynamic, so they cannot use a static Next image allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt=""
              className="h-6 w-6 rounded-[var(--radius-xs)]"
              aria-hidden="true"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] bg-accent-100 text-[11px] font-bold text-accent-700">
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <span className="max-w-[140px] truncate text-[13px] font-semibold text-text">
              {orgName}
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {navEntries.map((entry) => {
            const href = `/${orgSlug}${entry.href}`
            const active = pathname === href || pathname.startsWith(`${href}/`)

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
                  {!collapsed && <span className="truncate">{entry.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
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

        <div className={cn('flex items-center px-2.5 py-1', collapsed && 'justify-center px-0')}>
          <Logo size={16} showText={!collapsed} />
        </div>
      </div>
    </aside>
  )
}
