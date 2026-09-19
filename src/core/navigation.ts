export interface NavEntry {
  label: string
  href: string
  icon: string
  permission: string
  hint?: string
}

export interface NavGroup {
  label: string | null
  entries: NavEntry[]
}

export function isNavEntryActive(pathname: string, href: string): boolean {
  if (href.endsWith('/fees')) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
