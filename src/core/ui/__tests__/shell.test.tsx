import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
import type { NavEntry } from '@/core/navigation'

const mockNav: NavEntry[] = [
  { label: 'Classes', href: '/sessions', icon: 'CalendarDays', permission: 'session.view' },
  { label: 'Instructors', href: '/instructors', icon: 'Users', permission: 'instructor.view' },
]

describe('AppSidebar', () => {
  beforeEach(() => {
    localStorageMock.clear()
    pathname = '/acme/dashboard'
  })

  it('renders org name', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navEntries={mockNav} />)
    expect(screen.getByText('Acme Inc')).toBeInTheDocument()
  })

  it('renders nav entries', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navEntries={mockNav} />)
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('Instructors')).toBeInTheDocument()
  })

  it('renders Settings in footer', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navEntries={mockNav} canManageSettings />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders the FUNKtion wordmark', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navEntries={mockNav} />)
    expect(screen.getByText('FUNKtion')).toBeInTheDocument()
  })

  it('has collapse button', () => {
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navEntries={mockNav} />)
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument()
  })

  it('marks active nav item', () => {
    pathname = '/acme/sessions'
    render(<AppSidebar orgSlug="acme" orgName="Acme Inc" navEntries={mockNav} />)
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
    expect(screen.getByText('Instructors')).toBeInTheDocument()
  })

  it('filters results by query', () => {
    render(
      <CommandPalette orgSlug="acme" navEntries={mockNav} open={true} onClose={() => {}} />
    )
    const input = screen.getByPlaceholderText('Search pages...')
    fireEvent.change(input, { target: { value: 'inst' } })
    expect(screen.getByText('Instructors')).toBeInTheDocument()
    expect(screen.queryByText('Classes')).not.toBeInTheDocument()
  })
})
