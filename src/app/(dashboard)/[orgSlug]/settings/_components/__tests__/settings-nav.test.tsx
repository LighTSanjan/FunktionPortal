import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

let pathname = '/test-club/settings/audit-log'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { SettingsNav } from '../settings-nav'

const tabs = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'organisation', label: 'Organisation' },
  { slug: 'attendance', label: 'Attendance import' },
  { slug: 'access', label: 'Access requests' },
  { slug: 'invitations', label: 'Invitations' },
  { slug: 'audit-log', label: 'Audit Log' },
]

describe('SettingsNav', () => {
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    pathname = '/test-club/settings/audit-log'
    scrollIntoView.mockClear()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
  })

  it('marks and reveals the active tab, including tabs at the end of the row', () => {
    render(<SettingsNav orgSlug="test-club" tabs={tabs} />)

    expect(screen.getByRole('link', { name: 'Audit Log' })).toHaveAttribute('aria-current', 'page')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' })
  })

  it('keeps child routes in their parent settings section', () => {
    pathname = '/test-club/settings/attendance/import-1'
    render(<SettingsNav orgSlug="test-club" tabs={tabs} />)

    expect(screen.getByRole('link', { name: 'Attendance import' })).toHaveAttribute('aria-current', 'page')
  })
})
