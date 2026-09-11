import type { OrgRole } from '@prisma/client'
import type { NavEntry, NavGroup } from '@/core/navigation'
import { hasPermission } from '@/core/permissions'

/**
 * What the sidebar offers, grouped by what somebody came to do.
 *
 * It used to be a flat list of seven: Your access, Register, Instructors,
 * Classes, Attendance import, Subscription, Monthly run. That is the schema,
 * not the job. A treasurer arrives thinking "the coaches need paying for
 * August", which is the monthly run, the classes and the import — three
 * entries of equal weight with nothing to say they belong together, and no
 * hint that two of them are inputs to the third.
 *
 * So: two jobs at the top, the things you look up below them, and setup in
 * settings. "Attendance import" in particular was a top-level destination for
 * something done once or twice a trimester, next to a screen that does the
 * same job by hand.
 */
const GROUPS: readonly { label: string | null; entries: readonly NavEntry[] }[] = [
  {
    label: null,
    entries: [
      {
        label: 'Home',
        href: '/dashboard',
        icon: 'Home',
        // Everybody has this. `access.request` is the one permission every
        // role holds, which makes it the honest way to say "always".
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
        label: 'Subscriptions',
        href: '/fees/collection',
        icon: 'Wallet',
        permission: 'fee.manage',
        hint: 'Collect and reconcile',
      },
      {
        // The member's own subscription. Same word, different job, and only
        // one of the two is ever shown to any given person.
        label: 'Your subscription',
        href: '/fees',
        icon: 'Wallet',
        permission: 'fee.declare',
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
        // Was "Register", which in a dance club means the attendance
        // register — the thing this is not.
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
        label: 'Your access',
        href: '/access',
        icon: 'ClipboardCheck',
        permission: 'access.request',
      },
    ],
  },
]

/**
 * The exco see "Subscriptions"; a member sees "Your subscription". Offering
 * both to somebody who holds both permissions would be two entries pointing
 * at the same word.
 */
function suppressDuplicate(role: OrgRole, entries: NavEntry[]): NavEntry[] {
  if (!hasPermission(role, 'fee.manage')) return entries
  return entries.filter((entry) => entry.href !== '/fees')
}

/**
 * Below this, headings cost more than they give: an ordinary member sees
 * Home, their subscription and their access request, and three headings over
 * three items is a filing system for a drawer with three things in it.
 */
const GROUPING_WORTHWHILE = 4

export function resolveNavGroups(role: OrgRole): NavGroup[] {
  const groups = GROUPS.map((group) => ({
    label: group.label,
    entries: suppressDuplicate(
      role,
      group.entries.filter((entry) => hasPermission(role, entry.permission))
    ),
  })).filter((group) => group.entries.length > 0)

  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  if (total < GROUPING_WORTHWHILE) {
    return [{ label: null, entries: groups.flatMap((group) => group.entries) }]
  }
  return groups
}

/** Flat, for anything that just needs the reachable destinations. */
export function resolveNav(role: OrgRole): NavEntry[] {
  return resolveNavGroups(role).flatMap((group) => group.entries)
}
