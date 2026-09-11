import { describe, expect, it } from 'vitest'
import { deadline, count } from '../types'

const NOW = new Date(2026, 8, 11, 14, 30) // 11 September 2026, mid-afternoon

describe('how a deadline reads', () => {
  it('says nothing when there is no deadline', () => {
    expect(deadline(null, NOW)).toEqual({ label: null, urgency: 'normal' })
  })

  it('counts a deadline later today as today, not as passed', () => {
    // The window closes at the end of the day. A submission due at 5pm shown
    // as "1 day late" at 2pm is the portal lying about the one thing it is
    // here to keep track of.
    const result = deadline(new Date(2026, 8, 11, 9, 0), NOW)
    expect(result).toEqual({ label: 'Due today', urgency: 'urgent' })
  })

  it('counts lateness in whole days', () => {
    expect(deadline(new Date(2026, 8, 8), NOW)).toEqual({ label: '3 days late', urgency: 'overdue' })
    expect(deadline(new Date(2026, 8, 10), NOW)).toEqual({ label: '1 day late', urgency: 'overdue' })
  })

  it('escalates as the date approaches', () => {
    expect(deadline(new Date(2026, 8, 12), NOW).label).toBe('Due tomorrow')
    expect(deadline(new Date(2026, 8, 15), NOW).urgency).toBe('urgent')
    expect(deadline(new Date(2026, 8, 20), NOW).urgency).toBe('soon')
    expect(deadline(new Date(2026, 9, 30), NOW).urgency).toBe('normal')
  })

  it('names the date once it is far enough off to be a date rather than a countdown', () => {
    expect(deadline(new Date(2026, 8, 25), NOW).label).toBe('Due 25 September')
  })
})

describe('progress in a step’s own terms', () => {
  it('drops the fraction once everything is accounted for', () => {
    expect(count(4, 4)).toBe('4')
    expect(count(3, 4)).toBe('3 of 4')
    expect(count(0, 4)).toBe('0 of 4')
  })
})
