export interface NavEntry {
  label: string
  href: string
  icon: string
  permission: string
  /**
   * Shown under the label in the sidebar for the two entries that are jobs
   * rather than lists, because "Coach payments" and "Membership fees" are the
   * only two things most visits are about and naming them is not enough.
   */
  hint?: string
}

/**
 * Navigation is grouped because a flat list gives a database table and a
 * month's work equal weight.
 *
 * "Work" is what somebody came here to do. "Records" is what they came to
 * look up. Everything else — coaches, the roster, the import — is setup, and
 * it lives in settings, where you go once a term rather than once a month.
 */
export interface NavGroup {
  /** Null for the first group, which needs no heading above the first item. */
  label: string | null
  entries: NavEntry[]
}
