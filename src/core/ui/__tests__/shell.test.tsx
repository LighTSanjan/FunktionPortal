import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

let pathname = '/acme/dashboard'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { AppSidebar } from '../shell/app-sidebar'
import { AppHeader } from '../shell/app-header'
import { CommandPalette } from '../shell/command-palette'
import type { NavEntry, NavGroup } from '@/core/navigation'

const mockNav: NavEntry[] = [
  { label: 'Classes', href: '/sessions', icon: 'CalendarDays', permission: 'session.view' },
  { label: 'Coaches', href: '/instructors', icon: 'Users', permission: 'instructor.view' },
]

const mockGroups: NavGroup[] = [
  {
    label: null,
    entries: [{ label: 'Home', href: '/dashboard', icon: 'Home', permission: 'access.request' }],
  },
  { label: 'Records', entries: mockNav },
]

describe('AppSidebar', () => {
  beforeEach(() => {
    localStorageMock.clear()
    pathname = '/acme/dashboard'
  })

  it('shows the club logo at the top, named for the club, linking home', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navGroups={mockGroups} />)
    const logo = screen.getByAltText('Acme Inc')
    expect(logo).toHaveAttribute('src', '/funktion-logo.svg')
    expect(logo.closest('a')).toHaveAttribute('href', '/acme/dashboard')
  })

  it('groups the nav by what somebody came to do', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navGroups={mockGroups} />)
    expect(screen.getByText('Records')).toBeInTheDocument()
  })

  it('renders nav entries', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navGroups={mockGroups} />)
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('Coaches')).toBeInTheDocument()
  })

  it('renders Settings in footer', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navGroups={mockGroups} canManageSettings />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('has collapse button', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navGroups={mockGroups} />)
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument()
  })

  it('marks active nav item', () => {
    pathname = '/acme/sessions'
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navGroups={mockGroups} />)
    expect(screen.getByRole('link', { name: /Classes/i })).toHaveAttribute('aria-current', 'page')
  })
})

describe('AppHeader', () => {
  const defaultHeaderProps = {
    userName: 'John',
    userEmail: 'john@example.com',
    onSignOut: () => {},
  }

  it('renders command palette trigger', () => {
    render(<AppHeader {...defaultHeaderProps} />)
    expect(screen.getByLabelText('Open command palette')).toBeInTheDocument()
  })

  it('renders profile menu button', () => {
    render(<AppHeader {...defaultHeaderProps} />)
    expect(screen.getByLabelText('Profile menu')).toBeInTheDocument()
  })

  it('shows profile dropdown on click', () => {
    render(<AppHeader {...defaultHeaderProps} />)
    fireEvent.click(screen.getByLabelText('Profile menu'))
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

})

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CommandPalette orgSlug="acme" navEntries={mockNav} open={false} onClose={() => {}} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders search input when open', () => {
    render(
      <CommandPalette orgSlug="acme" navEntries={mockNav} open={true} onClose={() => {}} />
    )
    expect(screen.getByPlaceholderText('Search pages...')).toBeInTheDocument()
  })

  it('renders nav entries as results', () => {
    render(
      <CommandPalette orgSlug="acme" navEntries={mockNav} open={true} onClose={() => {}} />
    )
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('Coaches')).toBeInTheDocument()
  })

  it('filters results by query', () => {
    render(
      <CommandPalette orgSlug="acme" navEntries={mockNav} open={true} onClose={() => {}} />
    )
    const input = screen.getByPlaceholderText('Search pages...')
    fireEvent.change(input, { target: { value: 'coach' } })
    expect(screen.getByText('Coaches')).toBeInTheDocument()
    expect(screen.queryByText('Classes')).not.toBeInTheDocument()
  })

  it('keeps keyboard focus inside and returns it to the opener', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open search</button>
          <CommandPalette
            orgSlug="acme"
            navEntries={mockNav}
            open={open}
            onClose={() => setOpen(false)}
          />
        </>
      )
    }

    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open search' })
    opener.focus()
    fireEvent.click(opener)
    const input = screen.getByPlaceholderText('Search pages...')
    await waitFor(() => expect(input).toHaveFocus())

    const close = screen.getByRole('button', { name: 'Close command palette' })
    close.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(input).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(close).toHaveFocus()

    fireEvent.click(close)
    expect(opener).toHaveFocus()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <CommandPalette orgSlug="acme" navEntries={mockNav} open onClose={onClose} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
