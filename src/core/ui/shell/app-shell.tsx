'use client'

import * as React from 'react'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { CommandPalette } from './command-palette'
import { MobileNav } from './mobile-nav'
import type { NavEntry, NavGroup } from '@/core/navigation'
import type { PortalNotification } from '@/core/notifications/types'

interface AppShellProps {
  orgSlug: string
  orgName: string
  userName: string
  userEmail: string
  userPhoto?: string | null
  navGroups: NavGroup[]
  navEntries: NavEntry[]
  showSettings?: boolean
  notifications?: PortalNotification[]
  children: React.ReactNode
}

function AppShell({
  orgSlug,
  orgName,
  userName,
  userEmail,
  userPhoto,
  navGroups,
  navEntries,
  showSettings,
  notifications = [],
  children,
}: AppShellProps) {
  const [cmdOpen, setCmdOpen] = React.useState(false)

  const handleSignOut = React.useCallback(() => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/sign-out'
    document.body.appendChild(form)
    form.submit()
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <div className="hidden md:flex" data-print="hide">
        <AppSidebar
          orgSlug={orgSlug}
          orgName={orgName}
          navGroups={navGroups}
          showSettings={showSettings}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <div data-print="hide">
          <AppHeader
            userName={userName}
            userEmail={userEmail}
            userPhoto={userPhoto}
            profileHref={`/${orgSlug}/settings/profile`}
            onSignOut={handleSignOut}
            onCommandPalette={() => setCmdOpen(true)}
            notifications={notifications}
          />
        </div>

        <div className="md:hidden absolute top-3 left-3 z-40" data-print="hide">
          <MobileNav orgSlug={orgSlug} orgName={orgName} navEntries={navEntries} showSettings={showSettings} />
        </div>

        <main className="flex-1 overflow-y-auto bg-paper p-4 md:p-6" data-print="page">
          {children}
        </main>
      </div>

      <CommandPalette
        orgSlug={orgSlug}
        navEntries={navEntries}
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
      />
    </div>
  )
}

export { AppShell }
export type { AppShellProps }
