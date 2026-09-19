import type { OrgRole } from '@prisma/client'
import type { NavEntry, NavGroup } from '@/core/navigation'
import { hasPermission } from '@/core/permissions'

const GROUPS: readonly { label: string | null; entries: readonly NavEntry[] }[] = [
  {
    label: null,
    entries: [
      {
        label: 'Home',
        href: '/dashboard',
        icon: 'Home',
        permission: 'access.request',
      },
    ],
  },
  {
    label: 'Work',
    entries: [
      {
        label: 'Coach payments',
        href: '/monthly-run',
        icon: 'Receipt',
        permission: 'claim.generate',
        hint: 'Raise, sign, send',
      },
      {
        label: 'Membership fees',
        href: '/fees/collection',
        icon: 'Wallet',
        permission: 'fee.manage',
        hint: 'Who has paid',
      },
    ],
  },
  {
    label: 'Records',
    entries: [
      {
        label: 'Classes',
        href: '/sessions',
        icon: 'CalendarDays',
        permission: 'session.view',
      },
      {
        label: 'Transactions',
        href: '/register',
        icon: 'ClipboardList',
        permission: 'references.view',
      },
      {
        label: 'Coaches',
        href: '/instructors',
        icon: 'Users',
        permission: 'instructor.view',
      },
    ],
  },
  {
    label: 'You',
    entries: [
      {
        label: 'Your membership fee',
        href: '/fees',
        icon: 'Wallet',
        permission: 'fee.declare',
      },
      {
        label: 'Your access',
        href: '/access',
        icon: 'ClipboardCheck',
        permission: 'access.request',
      },
    ],
  },
]

const GROUPING_WORTHWHILE = 4

export function resolveNavGroups(role: OrgRole): NavGroup[] {
  const groups = GROUPS.map((group) => ({
    label: group.label,
    entries: group.entries.filter((entry) => hasPermission(role, entry.permission)),
  })).filter((group) => group.entries.length > 0)

  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  if (total < GROUPING_WORTHWHILE) {
    return [{ label: null, entries: groups.flatMap((group) => group.entries) }]
  }
  return groups
}
