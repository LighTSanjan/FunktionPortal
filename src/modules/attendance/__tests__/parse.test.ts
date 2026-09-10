import { describe, it, expect } from 'vitest'
import { parseCsv } from '../csv'
import { parseAttendanceSheet, SheetFormatError } from '../parse'
import { matchMembers, isDepartedLabel } from '../match'

/** Synthetic fixture shaped like the private trimester sheets. */
const SHEET = [
  ',1,Term,Student ID,Email,Phone No.,Birthday (DDMMYY),bday month bool,Medical/Dietary,Fees,Active,5 Jan,8 Jan,12 Jan,15 Jan',
  'Graduated,Ada Lovelace,,1000001,ada@example.com,90000001,10/12/1990,FALSE,-,,,,,,',
  'Total Term Alumni:,1,,,,,,,,,,0,0,0,0',
  'Confirmed,Grace Hopper,8,1000002,grace@example.com,90000002,09/12/1991,,,,,1,1,,1',
  // A comma inside a quoted name, and a second email in the same cell.
  '"Confirmed","Bell, Alexander Graham",8,1000003,bell@example.com / bell2@example.com,90000003,3/3/1992,,,,,,1,1,1',
  'Total Term 8:,2,,,,,,,,,,1,2,1,2',
  // Month-first birthday: 18 is impossible as a month, so the row is flipped.
  'Confirmed,Katherine Johnson,5,1000004,kj@example.com,90000004,9/18/1993,,,,,1,,1,',
  // No student ID at all — the sheet has one of these too.
  '1/2 term,Someone,bo idea,,,,,,,,,,,,',
  // The subtotal disagrees with the marks above it: the sheet says 2 on 5 Jan
  // where only one member is ticked. A real defect in a real sheet.
  'Total Term 5:,2,,,,,,,,,,2,0,1,0',
  'Grand Total:,5,,,,,,,,,,2,2,2,2',
  ',,,,,,1 -> 1.5h; 2 -> 3h,,,,,,,,',
  'INSTRUCTOR,Jin,-,-,jin@example.com,-,29/8/1900,FALSE,addr,-,,1,0,2,0',
  'INSTRUCTOR,KS,-,-,ks@example.com,-,04/6/1900,FALSE,addr,-,,0,1,0,0',
  'Total Instructors:,2,,,,,,,,,,1,1,1,0',
].join('\n')

const TERM = { termStart: new Date(Date.UTC(2026, 0, 1)), termEnd: new Date(Date.UTC(2026, 4, 1)) }
const parse = (csv = SHEET) => parseAttendanceSheet(parseCsv(csv), TERM)

describe('reading a trimester attendance sheet', () => {
  it('resolves the yearless date headers against the term', () => {
    // "5 Jan" is all the sheet says. Without the term there is no year, and a
    // class in the wrong year lands on the wrong month's coach invoice.
    expect(parse().dates.map((d) => d.iso)).toEqual([
      '2026-01-05',
      '2026-01-08',
      '2026-01-12',
      '2026-01-15',
    ])
  })

  it('refuses a sheet whose dates fall outside the term', () => {
    expect(() =>
      parseAttendanceSheet(parseCsv(SHEET), {
        termStart: new Date(Date.UTC(2026, 4, 18)),
        termEnd: new Date(Date.UTC(2026, 7, 22)),
      })
    ).toThrow(SheetFormatError)
  })

  it('refuses a sheet for a term that has not started', () => {
    // The roster is filled in weeks before the first class, so a sheet with no
    // date columns is a real thing to be handed — and there is nothing in it.
    const rosterOnly = SHEET.split('\n')
      .map((line) => line.split(',').slice(0, 11).join(','))
      .join('\n')
    expect(() => parse(rosterOnly)).toThrow(/not started|no class dates/i)
  })

  it('reads names with a comma in them', () => {
    const bell = parse().members.find((m) => m.studentId === '1000003')
    expect(bell?.fullName).toBe('Bell, Alexander Graham')
  })

  it('takes the first of two addresses in one email cell', () => {
    const bell = parse().members.find((m) => m.studentId === '1000003')
    expect(bell?.email).toBe('bell@example.com')
  })

  it('marks attendance from the ticks, treating blank and zero alike as absent', () => {
    const grace = parse().members.find((m) => m.studentId === '1000002')
    expect(grace?.presentOn).toEqual(['2026-01-05', '2026-01-08', '2026-01-15'])
  })

  it('reads who taught each class from the instructor rows', () => {
    // The whole reason this is worth automating: the sheet does record the
    // coach, in rows nobody thinks of as data.
    expect(parse().sessions).toEqual([
      { iso: '2026-01-05', instructorLabel: 'Jin', minutes: 90 },
      { iso: '2026-01-12', instructorLabel: 'Jin', minutes: 180 },
      { iso: '2026-01-08', instructorLabel: 'KS', minutes: 90 },
    ])
  })

  it('reads the duration legend from the sheet rather than assuming it', () => {
    // 1.5h + 3h for Jin, 1.5h for KS — the same arithmetic the treasurer's own
    // Total Hours block does, which is what makes it checkable.
    expect(parse().instructorHours).toEqual([
      { label: 'Jin', hours: 4.5 },
      { label: 'KS', hours: 1.5 },
    ])
  })

  it('honours a changed legend', () => {
    const doubled = SHEET.replace('1 -> 1.5h; 2 -> 3h', '1 -> 2h; 2 -> 4h')
    expect(parse(doubled).instructorHours[0]).toEqual({ label: 'Jin', hours: 6 })
  })

  it('reports a class somebody attended that nobody is recorded as teaching', () => {
    // Self-practice. A ClassSession requires an instructor, so this cannot be
    // imported silently — it has to be visible.
    expect(parse().unattributedDates).toEqual(['2026-01-15'])
  })

  it("reports where the sheet's own subtotal disagrees with the marks above it", () => {
    const conflicts = parse().subtotalConflicts
    expect(conflicts).toContainEqual({
      label: 'Total Term 5:',
      iso: '2026-01-05',
      sheetSays: 2,
      marksSay: 1,
    })
  })

  it('checks the grand total against every member, not just the last block', () => {
    const conflicts = parse().subtotalConflicts.filter((c) => c.label === 'Grand Total:')
    // Two are ticked on 5 Jan, one in each of two blocks — so this only
    // passes if the grand total is checked against everybody. Against the last
    // block alone it would find one and report a conflict that is not there.
    expect(conflicts.map((c) => c.iso)).not.toContain('2026-01-05')
  })

  it('flips a birthday that is impossible as day-first, and says so', () => {
    const kj = parse().members.find((m) => m.studentId === '1000004')
    expect([kj?.birthDay, kj?.birthMonth]).toEqual([18, 9])
    expect(parse().warnings.some((w) => /Katherine Johnson.*month-first/.test(w))).toBe(true)
  })

  it('keeps the roster label verbatim rather than normalising it away', () => {
    // "1/2 term" and "Confirmed; Exchange" are the club's own vocabulary and
    // the reason for a decision is in the wording.
    expect(parse().members.map((m) => m.rosterLabel)).toContain('1/2 term')
  })
})

describe('matching sheet rows to members', () => {
  const rows = parse().members
  const existing = [
    { id: 'm1', fullName: 'Grace Hopper', studentId: '1000002', email: null },
    { id: 'm2', fullName: 'Someone Else', studentId: '1000009', email: 'kj@example.com' },
  ]

  it('matches on student ID first', () => {
    const { matched } = matchMembers(rows, existing)
    expect(matched.find((m) => m.memberId === 'm1')?.basis).toBe('studentId')
  })

  it('falls back to email when the student ID is new', () => {
    const { matched } = matchMembers(rows, existing)
    expect(matched.find((m) => m.memberId === 'm2')?.basis).toBe('email')
  })

  it('never matches on a name two people share', () => {
    const twins = [
      { id: 'a', fullName: 'Grace Hopper', studentId: null, email: null },
      { id: 'b', fullName: 'Grace Hopper', studentId: null, email: null },
    ]
    const { matched, unmatched } = matchMembers(rows, twins)
    expect(matched).toHaveLength(0)
    expect(unmatched.map((r) => r.studentId)).toContain('1000002')
  })

  it('sets aside a row with no student ID rather than creating a member', () => {
    // Keyed on nothing, it would be created fresh on every future import.
    const { unidentifiable } = matchMembers(rows, existing)
    expect(unidentifiable.map((r) => r.fullName)).toEqual(['Someone'])
  })
})

describe('roster labels', () => {
  it.each([
    ['Graduated', true],
    ['Left after OH 2025 term', true],
    ['Confirmed', false],
    ['1/2 term', false],
    ['Confirmed; Exchange', false],
    // Unrecognised wording is not a departure. A label nobody has seen before
    // should not quietly deactivate somebody.
    ['May come back?', false],
  ])('reads %s as departed=%s', (label, departed) => {
    expect(isDepartedLabel(label)).toBe(departed)
  })
})
