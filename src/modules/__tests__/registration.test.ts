import { describe, expect, it } from 'vitest'
import { resolveNav } from '@/modules/register'

describe('navigation', () => {
  it('shows exco every current portal section in a stable order', () => {
    expect(resolveNav('EXCO').map((entry) => entry.label)).toEqual([
      'Your access',
      'Register',
      'Instructors',
      'Classes',
      'Attendance import',
      'Subscription',
      'Monthly run',
    ])
  })

  it('shows members only sections they may open', () => {
    // Their own subscription and their own access request. Everything else in
    // the portal reads the roster, the fund balances or the register.
    expect(resolveNav('MEMBER').map((entry) => entry.label)).toEqual([
      'Your access',
      'Subscription',
    ])
  })
})
