/** Pure parser for the club's trimester attendance-sheet grid. */

/** A dated class column. */
export interface SheetDate {
  /** The header as written, e.g. "18 May". */
  header: string
  /** Resolved against the term's own start and end dates. */
  iso: string
  columnIndex: number
}

export interface SheetMember {
  /** 1-based row in the sheet, so a problem can be pointed at. */
  rowNumber: number
  /** Column A verbatim: "Confirmed", "1/2 term", "Graduated". */
  rosterLabel: string | null
  fullName: string
  academicTerm: number | null
  studentId: string | null
  email: string | null
  phone: string | null
  birthDay: number | null
  birthMonth: number | null
  birthYear: number | null
  /** ISO dates this member is marked present on. */
  presentOn: string[]
}

/** A class the sheet says a named coach taught. */
export interface SheetSession {
  iso: string
  /** As written in the instructor row, e.g. "Jin", "KS". */
  instructorLabel: string
  minutes: number
}

/** A cell where the sheet's own subtotal disagrees with the marks under it. */
export interface SubtotalConflict {
  label: string
  iso: string
  sheetSays: number
  marksSay: number
}

export interface ParsedSheet {
  dates: SheetDate[]
  members: SheetMember[]
  sessions: SheetSession[]
  /** Dates somebody attended where no coach is marked — self-practice. */
  unattributedDates: string[]
  subtotalConflicts: SubtotalConflict[]
  /** Per coach, derived from the marks. Checkable against the sheet's own. */
  instructorHours: { label: string; hours: number }[]
  warnings: string[]
}

export interface ParseOptions {
  /** The term the sheet covers. Resolves the yearless date headers. */
  termStart: Date
  termEnd: Date
}

export class SheetFormatError extends Error {}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "18 May", "5 Jan", "14 June" — day then month, no year. */
const DATE_HEADER = /^(\d{1,2})\s+([A-Za-z]{3,})\.?$/

export function parseAttendanceSheet(grid: string[][], options: ParseOptions): ParsedSheet {
  const warnings: string[] = []
  const cell = (row: string[] | undefined, index: number) => (row?.[index] ?? '').trim()

  const headerIndex = grid.findIndex((row) => row.some((c) => c.trim() === 'Student ID'))
  if (headerIndex === -1) {
    throw new SheetFormatError(
      'No header row found. Expected a row containing a "Student ID" column — is this the attendance tab of the sheet?'
    )
  }
  const header = grid[headerIndex]
  const columnOf = (name: string) => header.findIndex((c) => c.trim().toLowerCase() === name.toLowerCase())

  const termColumn = columnOf('Term')
  const studentIdColumn = columnOf('Student ID')
  const emailColumn = columnOf('Email')
  const phoneColumn = columnOf('Phone No.')
  const birthdayColumn = header.findIndex((c) => /^birthday/i.test(c.trim()))
  // The name column's own header is a formula in every sheet the club has —
  // it renders as "1" rather than "Name" — so it is located by position
  // instead. Column A is the roster label, and Term follows the name.
  const nameColumn = columnOf('Name') !== -1 ? columnOf('Name') : termColumn - 1
  if (termColumn < 1 || nameColumn < 0) {
    throw new SheetFormatError('Header row has no "Term" column, so the name column cannot be located.')
  }

  const dates = readDateHeaders(header, options, warnings)
  if (dates.length === 0) {
    throw new SheetFormatError(
      'No class dates in the header row. A sheet for a term that has not started yet has none — there is nothing to import until the first class is recorded.'
    )
  }
  const members: SheetMember[] = []
  const sessions: SheetSession[] = []
  const subtotalConflicts: SubtotalConflict[] = []
  const instructorRows: { label: string; row: string[] }[] = []

  const minutesForMark = readLegend(grid, warnings)

  // Members accumulate until a subtotal row closes the block; `everyone` keeps
  // them all so the Grand Total can be checked the same way.
  let block: SheetMember[] = []
  const everyone: SheetMember[] = []

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i]
    const label = cell(row, 0)
    const name = cell(row, nameColumn)

    if (label.toUpperCase() === 'INSTRUCTOR') {
      instructorRows.push({ label: name, row })
      continue
    }

    if (/^(total\b|grand total)/i.test(label)) {
      // The instructors have a total row of their own; it counts coaches, not
      // attendance, so it is not a check on the marks above it.
      if (/instructors/i.test(label)) continue
      const against = /^grand total/i.test(label) ? everyone : block
      for (const date of dates) {
        const printed = cell(row, date.columnIndex)
        if (printed === '') continue
        const sheetSays = Number(printed)
        if (!Number.isFinite(sheetSays)) continue
        const marksSay = against.filter((m) => m.presentOn.includes(date.iso)).length
        if (sheetSays !== marksSay) {
          subtotalConflicts.push({ label, iso: date.iso, sheetSays, marksSay })
        }
      }
      if (!/^grand total/i.test(label)) everyone.push(...block)
      block = []
      continue
    }

    if (name === '') continue

    const member: SheetMember = {
      rowNumber: i + 1,
      rosterLabel: label || null,
      fullName: collapse(name),
      academicTerm: intOrNull(cell(row, termColumn)),
      studentId: cell(row, studentIdColumn) || null,
      email: firstEmail(cell(row, emailColumn)),
      phone: cell(row, phoneColumn).replace(/\s+/g, '') || null,
      ...readBirthday(cell(row, birthdayColumn), collapse(name), warnings),
      presentOn: dates.filter((d) => isMark(cell(row, d.columnIndex))).map((d) => d.iso),
    }
    members.push(member)
    block.push(member)
  }

  for (const { label, row } of instructorRows) {
    for (const date of dates) {
      const minutes = minutesForMark(cell(row, date.columnIndex))
      if (minutes > 0) sessions.push({ iso: date.iso, instructorLabel: label, minutes })
    }
  }

  const taught = new Set(sessions.map((s) => s.iso))
  const attended = new Set(members.flatMap((m) => m.presentOn))
  const unattributedDates = dates
    .map((d) => d.iso)
    .filter((iso) => !taught.has(iso) && attended.has(iso))

  const instructorHours = instructorRows.map(({ label, row }) => ({
    label,
    hours:
      dates.reduce((total, d) => total + minutesForMark(cell(row, d.columnIndex)), 0) / 60,
  }))

  return { dates, members, sessions, unattributedDates, subtotalConflicts, instructorHours, warnings }
}

/** Resolve yearless headers against the selected term without guessing. */
function readDateHeaders(header: string[], options: ParseOptions, warnings: string[]): SheetDate[] {
  const startYear = options.termStart.getUTCFullYear()
  const endYear = options.termEnd.getUTCFullYear()
  const dates: SheetDate[] = []

  for (let columnIndex = 0; columnIndex < header.length; columnIndex++) {
    const text = header[columnIndex].trim()
    const match = DATE_HEADER.exec(text)
    if (!match) continue

    const day = Number(match[1])
    const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase())
    if (month === -1) {
      warnings.push(`Column header "${text}" is not a month the sheet can be read against; skipped.`)
      continue
    }

    const fits: string[] = []
    for (let year = startYear; year <= endYear; year++) {
      const candidate = new Date(Date.UTC(year, month, day))
      if (candidate.getUTCMonth() !== month) continue // 31 Apr and friends
      if (candidate >= options.termStart && candidate <= options.termEnd) {
        fits.push(candidate.toISOString().slice(0, 10))
      }
    }

    if (fits.length === 0) {
      throw new SheetFormatError(
        `Class date "${text}" falls outside the term this sheet is being imported against (${iso(options.termStart)} to ${iso(options.termEnd)}). Either the wrong term is selected, or the term's dates need correcting.`
      )
    }
    if (fits.length > 1) {
      // Only reachable for a term longer than a year, which no trimester is.
      throw new SheetFormatError(`Class date "${text}" is ambiguous within the selected term.`)
    }

    dates.push({ header: text, iso: fits[0], columnIndex })
  }

  return dates
}

/**
 * The mark-to-duration legend, read from the sheet rather than assumed.
 *
 * Every sheet carries "1 -> 1.5h; 2 -> 3h" in a cell above the instructor
 * rows. Reading it means a term that changes the class length reconciles on
 * its own; hard-coding it would silently keep billing the old one.
 */
function readLegend(grid: string[][], warnings: string[]): (mark: string) => number {
  const DEFAULT = new Map([['1', 90], ['2', 180]])
  const cell = grid.flat().find((c) => /\d\s*->\s*[\d.]+\s*h/i.test(c))

  if (!cell) {
    warnings.push('No "1 -> 1.5h" legend found in the sheet; assumed 1 = 1.5 hours and 2 = 3 hours.')
    return (mark) => DEFAULT.get(mark.trim()) ?? 0
  }

  const table = new Map<string, number>()
  for (const [, mark, hours] of cell.matchAll(/(\d+)\s*->\s*([\d.]+)\s*h/gi)) {
    table.set(mark, Math.round(Number(hours) * 60))
  }
  return (mark) => table.get(mark.trim()) ?? 0
}

/** A present mark. Blank and a literal zero both mean absent. */
function isMark(value: string): boolean {
  return value !== '' && value !== '0'
}

/** Read DD/MM birthdays, accepting unambiguous month-first exceptions. */
function readBirthday(
  value: string,
  who: string,
  warnings: string[]
): { birthDay: number | null; birthMonth: number | null; birthYear: number | null } {
  const none = { birthDay: null, birthMonth: null, birthYear: null }
  if (!value) return none

  const parts = value.split(/[/\-.]/).map((p) => p.trim())
  if (parts.length < 2) return none

  let day = Number(parts[0])
  let month = Number(parts[1])
  if (!Number.isInteger(day) || !Number.isInteger(month)) return none

  if (month > 12 && day <= 12) {
    warnings.push(`${who}'s birthday "${value}" reads as month-first; taken as day ${month}, month ${day}.`)
    ;[day, month] = [month, day]
  }
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    warnings.push(`${who}'s birthday "${value}" could not be read; left blank.`)
    return none
  }

  // The year is the least reliable column in the sheet — it holds 2022 for
  // people born in 2002, and "XXXX" where nobody knew. Only a plausible one is
  // kept, and it is never needed for the thing this is used for.
  const year = Number(parts[2])
  const plausible = Number.isInteger(year) && year >= 1940 && year <= 2020

  return { birthDay: day, birthMonth: month, birthYear: plausible ? year : null }
}

/** The roster holds two addresses in one cell for at least one member. */
function firstEmail(value: string): string | null {
  const first = value.split(/[/,;]| {2,}/)[0]?.trim()
  return first ? first.replace(/\s+/g, '') : null
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function intOrNull(value: string): number | null {
  const n = Number(value)
  return Number.isInteger(n) && value !== '' ? n : null
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}
