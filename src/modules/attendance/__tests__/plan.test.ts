/** Deciding what each date in a sheet is, before anything is written. */
import { describe, it, expect } from 'vitest'
import { buildDatePlan, SELF_PRACTICE_MINUTES, type DateOverride } from '../apply'
import type { ParsedSheet } from '../parse'

const INSTRUCTORS = [
  { id: 'i-jin', fullName: 'Neo Renyi', shortCode: 'JIN' },
  { id: 'i-ks', fullName: 'Lim Kai Song', shortCode: 'KS' },
]

function sheet(over: Partial<ParsedSheet> = {}): ParsedSheet {
  return {
    dates: [
      { header: '5 Jan', iso: '2026-01-05', columnIndex: 11 },
      { header: '8 Jan', iso: '2026-01-08', columnIndex: 12 },
      { header: '15 Jan', iso: '2026-01-15', columnIndex: 13 },
      { header: '22 Jan', iso: '2026-01-22', columnIndex: 14 },
    ],
    members: [],
    sessions: [
      { iso: '2026-01-05', instructorLabel: 'JIN', minutes: 90 },
      { iso: '2026-01-08', instructorLabel: 'KS', minutes: 180 },
      // A label the portal has no instructor for.
      { iso: '2026-01-22', instructorLabel: 'Guest', minutes: 90 },
    ],
    unattributedDates: ['2026-01-15'],
    subtotalConflicts: [],
    instructorHours: [],
    warnings: [],
    ...over,
  }
}

describe('buildDatePlan', () => {
  it('puts a coach on the dates the sheet names one for', () => {
    const plan = buildDatePlan(sheet(), {}, INSTRUCTORS)
    expect(plan.get('2026-01-05')).toEqual({ instructorId: 'i-jin', minutes: 90 })
    expect(plan.get('2026-01-08')).toEqual({ instructorId: 'i-ks', minutes: 180 })
  })

  it('reads a date with attendance and no coach as self-practice', () => {
    // The sheet is not being vague. It is saying the club met on its own.
    expect(buildDatePlan(sheet(), {}, INSTRUCTORS).get('2026-01-15')).toEqual({
      instructorId: null,
      minutes: SELF_PRACTICE_MINUTES,
    })
  })

  it('leaves out a date whose coach matches nobody, rather than calling it self-practice', () => {
    // "Nobody taught it" and "we do not know who taught it" are different
    // claims, and only the first one is safe to write down.
    expect(buildDatePlan(sheet(), {}, INSTRUCTORS).has('2026-01-22')).toBe(false)
  })

  it('writes nothing for a date nobody attended and nobody taught', () => {
    const empty = sheet({ sessions: [], unattributedDates: [] })
    expect(buildDatePlan(empty, {}, INSTRUCTORS).size).toBe(0)
  })

  it('lets a human name the coach the sheet did not', () => {
    const overrides: Record<string, DateOverride> = {
      '2026-01-22': { instructorId: 'i-ks', minutes: 90 },
    }
    expect(buildDatePlan(sheet(), overrides, INSTRUCTORS).get('2026-01-22')).toEqual({
      instructorId: 'i-ks',
      minutes: 90,
    })
  })

  it('lets a human turn a coached date into self-practice', () => {
    const overrides: Record<string, DateOverride> = {
      '2026-01-05': { instructorId: null, minutes: 120 },
    }
    expect(buildDatePlan(sheet(), overrides, INSTRUCTORS).get('2026-01-05')).toEqual({
      instructorId: null,
      minutes: 120,
    })
  })

  it('lets a human drop a date entirely', () => {
    const plan = buildDatePlan(sheet(), { '2026-01-15': null }, INSTRUCTORS)
    expect(plan.has('2026-01-15')).toBe(false)
  })

  it('matches a coach by full name as well as by short code', () => {
    const named = sheet({
      sessions: [{ iso: '2026-01-05', instructorLabel: 'neo renyi', minutes: 90 }],
      unattributedDates: [],
    })
    expect(buildDatePlan(named, {}, INSTRUCTORS).get('2026-01-05')?.instructorId).toBe('i-jin')
  })
})
