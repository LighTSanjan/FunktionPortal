/**
 * Freezing a raised month.
 *
 * The property under test is the one the whole design rests on: what comes
 * back out of a snapshot is what went in, whatever has happened to the rows it
 * was taken from.
 */
import { describe, it, expect } from 'vitest'
import {
  captureSnapshot,
  readSnapshot,
  sessionsFrom,
  linesFrom,
  SNAPSHOT_VERSION,
} from '../snapshot'
import type { CaptureInput } from '../snapshot'

const INPUT: CaptureInput = {
  organisationName: 'Testing Society',
  institutionShortName: 'SUTD',
  instructor: {
    fullName: 'Rina Halim',
    addressLines: ['12 Jalan Sempit'],
    bankName: 'DBS',
    bankAccountNo: '000-11111-2',
    danceStyle: 'Locking',
  },
  billTo: { name: 'A University', addressLines: ['1 Campus Way'] },
  branding: { tagline: 'A dance club', bandColors: ['F05820'] },
  roster: [
    { id: 'm2', fullName: 'Bo Tan' },
    { id: 'm1', fullName: 'Aiyana Bell' },
  ],
  sessions: [
    {
      heldOn: new Date(2026, 4, 4),
      durationMinutes: 90,
      instructorPresent: true,
      presentMemberIds: new Set(['m2', 'm1']),
      presentCount: 2,
    },
    {
      heldOn: new Date(2026, 4, 18),
      durationMinutes: 120,
      instructorPresent: false,
      presentMemberIds: new Set(['m1']),
      presentCount: 1,
    },
  ],
  clubFundBalanceCents: 361516,
}

/** What the column round-trips through. */
function throughJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('captureSnapshot', () => {
  it('survives the trip through a JSON column', () => {
    const stored = throughJson(captureSnapshot(INPUT))
    const read = readSnapshot(stored)
    expect(read).not.toBeNull()
    expect(read!.instructor.bankAccountNo).toBe('000-11111-2')
    expect(read!.roster).toHaveLength(2)
    expect(read!.billTo.name).toBe('A University')
    expect(read!.institutionShortName).toBe('SUTD')
  })

  it('keeps the date in the local calendar', () => {
    // A UTC round-trip renders a Singapore class on the 4th as the 3rd, which
    // puts it in the wrong week on the sheet and, at a month boundary, on the
    // wrong invoice.
    const snapshot = captureSnapshot(INPUT)
    expect(snapshot.sessions[0].heldOn).toBe('2026-05-04')

    const back = sessionsFrom(snapshot)
    expect(back[0].heldOn.getFullYear()).toBe(2026)
    expect(back[0].heldOn.getMonth()).toBe(4)
    expect(back[0].heldOn.getDate()).toBe(4)
  })

  it('brings back the attendance exactly as it was marked', () => {
    const back = sessionsFrom(readSnapshot(throughJson(captureSnapshot(INPUT)))!)
    expect(back[0].presentMemberIds.has('m1')).toBe(true)
    expect(back[0].presentCount).toBe(2)
    expect(back[1].presentMemberIds.has('m2')).toBe(false)
    expect(back[1].presentCount).toBe(1)
  })

  it('keeps a self-practice date as one', () => {
    const back = sessionsFrom(captureSnapshot(INPUT))
    expect(back[0].instructorPresent).toBe(true)
    expect(back[1].instructorPresent).toBe(false)
  })

  it('orders the attendance so two snapshots of one month compare equal', () => {
    const a = captureSnapshot(INPUT)
    const b = captureSnapshot({
      ...INPUT,
      sessions: INPUT.sessions.map((s) => ({
        ...s,
        presentMemberIds: new Set([...s.presentMemberIds].reverse()),
      })),
    })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('readSnapshot', () => {
  it('refuses anything it cannot render in full', () => {
    // Half a snapshot renders half a document, which is worse than refusing.
    expect(readSnapshot(null)).toBeNull()
    expect(readSnapshot({})).toBeNull()
    expect(readSnapshot({ version: SNAPSHOT_VERSION })).toBeNull()

    const good = captureSnapshot(INPUT)
    expect(readSnapshot({ ...good, roster: undefined })).toBeNull()
    expect(readSnapshot({ ...good, billTo: undefined })).toBeNull()
    expect(readSnapshot({ ...good, instructor: undefined })).toBeNull()
  })

  it('refuses a snapshot from a shape this code no longer understands', () => {
    expect(readSnapshot({ ...captureSnapshot(INPUT), version: SNAPSHOT_VERSION + 1 })).toBeNull()
  })
})

describe('linesFrom', () => {
  it('reads the billed lines off the invoice rather than off the classes', () => {
    // The invoice row is the accounting record. Rebuilding its lines from
    // live classes and rates is how a document and its own total come to
    // disagree.
    const lines = linesFrom([
      { heldOn: new Date(2026, 4, 4), minutes: 90, rateCents: 9000, amountCents: 13500 },
    ])
    expect(lines).toEqual([
      {
        heldOn: new Date(2026, 4, 4),
        durationMinutes: 90,
        hourlyRateCents: 9000,
        amountCents: 13500,
      },
    ])
  })
})
