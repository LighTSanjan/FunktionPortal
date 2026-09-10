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
      'Monthly run',
    ])
  })

  it('shows members only sections they may open', () => {
    expect(resolveNav('MEMBER').map((entry) => entry.label)).toEqual([
      'Your access',
    ])
  })
})
