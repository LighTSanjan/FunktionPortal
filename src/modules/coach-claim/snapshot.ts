/**
 * A raised month, frozen.
 *
 * Both monthly documents used to be rebuilt on every download from live
 * class, rate, roster and instructor rows. The guards stop a class in a raised
 * month being edited, but nothing stopped a rate being backdated, a member
 * joining the roster, a coach changing bank account, or attendance being
 * re-marked — and each of those silently changes a document already sitting
 * with the Office of Finance, while the invoice row keeps the total it was
 * issued with.
 *
 * So the month is captured when it is raised, and every later rendering reads
 * this. The invoice row and its lines remain the authority for the money; this
 * is everything else the two documents say.
 */
import type {
  BillTo,
  Branding,
  ClaimLine,
  InstructorDetails,
  RosterMember,
  SheetSession,
} from './types'
import { isoDate } from './theme'

/** Bumped when the shape changes in a way an old row cannot satisfy. */
export const SNAPSHOT_VERSION = 1

/** A class as it stood, with attendance as it was marked at that moment. */
export interface SnapshotSession {
  /** Local calendar date, `2026-05-04`. */
  heldOn: string
  durationMinutes: number
  /** False is a self-practice date: on the sheet, on no invoice. */
  instructorPresent: boolean
  presentMemberIds: string[]
}

export interface MonthSnapshot {
  version: number
  organisationName: string
  institutionShortName?: string
  instructor: InstructorDetails
  billTo: BillTo
  branding?: Branding
  roster: RosterMember[]
  sessions: SnapshotSession[]
  clubFundBalanceCents?: number
}

export class MonthNotFrozenError extends Error {
  constructor() {
    super(
      'That month was raised before the portal started freezing them, so its documents ' +
        'cannot be reproduced as they were issued. Void it and raise it again.'
    )
    this.name = 'MonthNotFrozenError'
  }
}

export interface CaptureInput {
  organisationName: string
  institutionShortName?: string
  instructor: InstructorDetails
  billTo: BillTo
  branding?: Branding
  roster: RosterMember[]
  sessions: SheetSession[]
  clubFundBalanceCents?: number
}

export function captureSnapshot(input: CaptureInput): MonthSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    organisationName: input.organisationName,
    institutionShortName: input.institutionShortName,
    instructor: input.instructor,
    billTo: input.billTo,
    branding: input.branding,
    roster: input.roster,
    sessions: input.sessions.map((session) => ({
      heldOn: isoDate(session.heldOn),
      durationMinutes: session.durationMinutes,
      instructorPresent: session.instructorPresent,
      // Sorted so two snapshots of the same month compare equal, which is
      // what makes a stored snapshot diffable against a re-derived one.
      presentMemberIds: [...session.presentMemberIds].sort(),
    })),
    clubFundBalanceCents: input.clubFundBalanceCents,
  }
}

/**
 * Read one back, or null.
 *
 * Deliberately strict about the shape rather than casting: this is JSON from
 * a column, and a document that renders half a snapshot is worse than one
 * that refuses to render.
 */
export function readSnapshot(value: unknown): MonthSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.version !== SNAPSHOT_VERSION) return null
  if (typeof record.organisationName !== 'string') return null
  if (!record.instructor || typeof record.instructor !== 'object') return null
  if (!Array.isArray(record.roster) || !Array.isArray(record.sessions)) return null
  if (!record.billTo || typeof record.billTo !== 'object') return null
  return record as unknown as MonthSnapshot
}

/** The sheet's grid, rebuilt from the snapshot rather than from live rows. */
export function sessionsFrom(snapshot: MonthSnapshot): SheetSession[] {
  return snapshot.sessions.map((session) => {
    const present = new Set(session.presentMemberIds)
    return {
      // Local midnight, matching how every other date in the documents is
      // built — a UTC parse would render a Singapore class a day early.
      heldOn: fromIsoDate(session.heldOn),
      durationMinutes: session.durationMinutes,
      instructorPresent: session.instructorPresent,
      presentMemberIds: present,
      presentCount: present.size,
    }
  })
}

/** The billed lines, rebuilt from the invoice's own rows. */
export function linesFrom(
  rows: { heldOn: Date; minutes: number; rateCents: number; amountCents: number }[]
): ClaimLine[] {
  return rows.map((row) => ({
    heldOn: row.heldOn,
    durationMinutes: row.minutes,
    hourlyRateCents: row.rateCents,
    amountCents: row.amountCents,
  }))
}

export function fromIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
