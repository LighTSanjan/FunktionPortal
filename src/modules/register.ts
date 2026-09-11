import type { OrgRole } from '@prisma/client'
import type { NavEntry } from '@/core/navigation'
import { hasPermission } from '@/core/permissions'

const NAV_ENTRIES: readonly NavEntry[] = [
  {
    label: 'Your access',
    href: '/access',
    icon: 'ClipboardCheck',
    permission: 'access.request',
  },
  {
    label: 'Register',
    href: '/register',
    icon: 'ClipboardList',
    permission: 'references.view',
  },
  {
    label: 'Instructors',
    href: '/instructors',
    icon: 'Users',
    permission: 'instructor.view',
  },
  {
    label: 'Classes',
    href: '/sessions',
    icon: 'CalendarDays',
    permission: 'session.view',
  },
  {
    label: 'Attendance import',
    href: '/attendance',
    icon: 'FileSpreadsheet',
    permission: 'session.manage',
  },
  {
    label: 'Subscription',
    href: '/fees',
    icon: 'Wallet',
    permission: 'fee.declare',
  },
  {
    label: 'Monthly run',
    href: '/monthly-run',
    icon: 'Receipt',
    permission: 'claim.generate',
  },
]

export function resolveNav(role: OrgRole): NavEntry[] {
  return NAV_ENTRIES.filter((entry) => hasPermission(role, entry.permission))
}
