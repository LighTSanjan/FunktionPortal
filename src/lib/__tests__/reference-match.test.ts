import { describe, expect, it } from 'vitest'
import { referenceKey, sameReference } from '../reference-match'

describe('matching hand-typed reference numbers', () => {
  it('treats the register’s spellings as the portal’s numbers', () => {
    expect(sameReference('INC-26-097-0001', 'INC26-097-0001')).toBe(true)
    expect(sameReference('IV26-097-00010', 'IV26-097-0010')).toBe(true)
    expect(sameReference(' iv26-097-0010 ', 'IV26-097-0010')).toBe(true)
  })

  it('keeps different documents apart', () => {
    expect(sameReference('IV26-097-00012', 'IV26-097-0011')).toBe(false)
    expect(sameReference('IV26-097-0010', 'IV25-097-0010')).toBe(false)
    expect(sameReference('IV26-097-0010', 'INC26-097-0010')).toBe(false)
  })

  it('matches nothing to nothing', () => {
    expect(referenceKey('SLCLUB097')).toBeNull()
    expect(sameReference(null, null)).toBe(false)
    expect(sameReference('SLCLUB097', 'SLCLUB097')).toBe(false)
  })
})
