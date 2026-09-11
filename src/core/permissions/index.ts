import type { OrgRole } from '@prisma/client'

const MEMBER_PERMISSIONS = [
  'access.request',
  // Declaring a payment is a claim about your own money, not a decision about
  // the club's. Confirming one is the decision, and it is exco-only — the two
  // are deliberately different permissions held by different people.
  'fee.declare',
] as const

const EXCO_PERMISSIONS = [
  ...MEMBER_PERMISSIONS,
  'org.manage_settings',
  'org.manage_members',
  'audit.view',
  'instructor.view',
  'instructor.manage',
  'session.view',
  'session.manage',
  'claim.generate',
  'references.view',
  'fee.manage',
] as const

const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<string>> = {
  MEMBER: new Set(MEMBER_PERMISSIONS),
  EXCO: new Set(EXCO_PERMISSIONS),
}

export function permissionsForRole(role: OrgRole): Set<string> {
  return new Set(ROLE_PERMISSIONS[role])
}

export function hasPermission(role: OrgRole, key: string): boolean {
  return ROLE_PERMISSIONS[role].has(key)
}
