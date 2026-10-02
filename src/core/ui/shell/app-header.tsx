'use client'

import * as React from 'react'
import Link from 'next/link'
import { Search, Moon, Sun, Monitor, LogOut, Bell, ArrowRight, UserRound } from 'lucide-react'
import { Avatar } from '@/core/ui/avatar'
import { cn } from '@/lib/utils'
import type { PortalNotification } from '@/core/notifications/types'

interface AppHeaderProps {
  userName: string
  userEmail: string
  userPhoto?: string | null
  /** Where the menu's "Your profile" goes. */
  profileHref?: string
  onSignOut: () => void
  onCommandPalette?: () => void
  notifications?: PortalNotification[]
}

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'funktion-theme'

/** Match the root layout's pre-paint default. */
function getThemeSnapshot(): Theme {
  if (typeof window === 'undefined') return 'light'
  return (localStorage.getItem(THEME_KEY) as Theme) || 'light'
}

function getThemeServerSnapshot(): Theme {
  return 'light'
}

function subscribeTheme(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

function applyTheme(t: Theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (t === 'light') root.classList.add('light')
  else if (t === 'dark') root.classList.add('dark')
}

function AppHeader({
  userName,
  userEmail,
  userPhoto,
  profileHref,
  onSignOut,
  onCommandPalette,
  notifications = [],
}: AppHeaderProps) {
  const theme = React.useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot)
  const [openMenu, setOpenMenu] = React.useState<'notifications' | 'profile' | null>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    applyTheme(theme)
  }, [theme])

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onCommandPalette?.()
      } else if (e.key === 'Escape') {
        setOpenMenu(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCommandPalette])

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    if (openMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [openMenu])

  function cycleTheme() {
    const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    localStorage.setItem(THEME_KEY, next)
    applyTheme(next)
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }))
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  const notificationLabel = notifications.length === 0
    ? 'Notifications'
    : `Notifications, ${notifications.length} active`

  return (
    <header className="flex h-14 items-center justify-end border-b border-border bg-bg px-4">
      <div className="flex items-center gap-1">
        <button
          onClick={onCommandPalette}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-[12px] text-text-subtle transition-colors hover:bg-surface-hover hover:text-text-muted"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex h-4 items-center rounded border border-border px-1 text-[10px] font-medium text-text-subtle">
            ⌘K
          </kbd>
        </button>

        <div className="relative flex items-center gap-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
            className="relative flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            aria-expanded={openMenu === 'notifications'}
            aria-haspopup="menu"
            aria-label={notificationLabel}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {notifications.length > 0 && (
              <span className="absolute right-0 top-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-bg">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
            className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 transition-colors hover:bg-surface-hover"
            aria-expanded={openMenu === 'profile'}
            aria-haspopup="true"
            aria-label="Profile menu"
          >
            <Avatar fallback={userName} src={userPhoto} size="sm" />
          </button>

          {openMenu === 'notifications' && (
            <div
              className="absolute right-9 top-10 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-lg"
              role="menu"
              aria-label="Notifications"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-[13px] font-semibold text-text">Notifications</p>
                {notifications.length > 0 && (
                  <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent-700">
                    {notifications.length}
                  </span>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-text-muted">Nothing new.</p>
              ) : (
                <div className="max-h-[min(26rem,70vh)] overflow-y-auto p-1.5">
                  {notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      href={notification.href}
                      role="menuitem"
                      onClick={() => setOpenMenu(null)}
                      className="group flex gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          notification.tone === 'urgent' && 'bg-danger',
                          notification.tone === 'attention' && 'bg-warning',
                          notification.tone === 'info' && 'bg-info'
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-snug text-text">
                          {notification.title}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-text-muted">
                          {notification.detail}
                        </span>
                      </span>
                      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {openMenu === 'profile' && (
            <div
              className="absolute right-0 top-10 z-50 w-56 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-lg"
              role="menu"
              aria-label="User menu"
            >
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-[13px] font-medium text-text">{userName}</p>
                <p className="text-[12px] text-text-muted truncate">{userEmail}</p>
              </div>

              {profileHref && (
                <Link
                  href={profileHref}
                  onClick={() => setOpenMenu(null)}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-3 py-1.5 text-[13px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                  role="menuitem"
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  Your profile
                </Link>
              )}

              <button
                onClick={cycleTheme}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-3 py-1.5 text-[13px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                role="menuitem"
              >
                <ThemeIcon className="h-4 w-4" aria-hidden="true" />
                Theme: {theme}
              </button>

              <button
                onClick={() => {
                  setOpenMenu(null)
                  onSignOut()
                }}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-3 py-1.5 text-[13px] text-danger transition-colors hover:bg-surface-hover"
                role="menuitem"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export { AppHeader }
export type { AppHeaderProps }
