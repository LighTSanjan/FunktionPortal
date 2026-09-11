import { describe, expect, it } from 'vitest'
import { hasPermission, permissionsForRole } from '@/core/permissions'

describe('permissions', () => {
  it('limits members to their own records and access requests', () => {
    expect(permissionsForRole('MEMBER')).toEqual(new Set(['access.request', 'fee.declare']))
    expect(hasPermission('MEMBER', 'session.manage')).toBe(false)
  })

  it('separates declaring a payment from confirming one', () => {
    // The whole control in fee collection is that these are different people.
    // A member saying they paid is a claim; the exco saying so is the record.
    expect(hasPermission('MEMBER', 'fee.declare')).toBe(true)
    expect(hasPermission('MEMBER', 'fee.manage')).toBe(false)
    expect(hasPermission('EXCO', 'fee.manage')).toBe(true)
  })

  it('allows exco to operate the portal', () => {
    expect(hasPermission('EXCO', 'org.manage_members')).toBe(true)
    expect(hasPermission('EXCO', 'instructor.manage')).toBe(true)
    expect(hasPermission('EXCO', 'claim.generate')).toBe(true)
    expect(hasPermission('EXCO', 'references.view')).toBe(true)
  })

  it('rejects unknown permission keys', () => {
    expect(hasPermission('EXCO', 'nonexistent.permission')).toBe(false)
  })
})
