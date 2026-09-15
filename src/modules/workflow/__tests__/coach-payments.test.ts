import { describe, expect, it } from 'vitest'
import { describeMonth, isFinished, type MonthState } from '../coach-payments'

/** 11 September 2026. August's documents are due on the 15th. */
const NOW = new Date(2026, 8, 11, 9, 0)

function month(overrides: Partial<MonthState> = {}): MonthState {
  return {
    year: 2026,
    month: 8,
    taught: 2,
    raised: 0,
    signed: 0,
    sent: 0,
    paid: 0,
    sessions: 9,
    voided: 0,
    dueAt: null,
    blocked: [],
    ...overrides,
  }
}

function stateOf(workflow: ReturnType<typeof describeMonth>, key: string) {
  return workflow.steps.find((step) => step.key === key)?.state
}

describe('what the treasurer is told to do next', () => {
  it('asks for the classes first, because everything is derived from them', () => {
    const workflow = describeMonth(month({ sessions: 0, taught: 0 }), 'acme', NOW)
    expect(workflow.next?.label).toContain('Record')
  })

  it('asks to raise the documents once the classes are in', () => {
    const workflow = describeMonth(month(), 'acme', NOW)
    expect(workflow.next?.label).toBe('Raise August 2026’s documents')
    expect(stateOf(workflow, 'raise')).toBe('current')
  })

  it('says to raise the rest when only some coaches are done', () => {
    const workflow = describeMonth(month({ raised: 1 }), 'acme', NOW)
    expect(workflow.next?.label).toBe('Raise the rest')
  })

  it('moves to signing only once everything is raised', () => {
    const workflow = describeMonth(month({ raised: 2 }), 'acme', NOW)
    expect(workflow.next?.label).toBe('Read and sign them')
    expect(stateOf(workflow, 'raise')).toBe('done')
  })

  it('moves to sending once everything is signed', () => {
    const workflow = describeMonth(month({ raised: 2, signed: 2 }), 'acme', NOW)
    expect(workflow.next?.label).toBe('Send them to OSL')
  })

  it('stops asking for anything once it is with OSL', () => {
    // Nothing the treasurer does makes OSL pay. Calling that an action would
    // be the portal inventing work and then nagging about it.
    const workflow = describeMonth(month({ raised: 2, signed: 2, sent: 2 }), 'acme', NOW)
    expect(workflow.next).toBeNull()
    expect(workflow.restingState).toContain('Waiting on payment')
    expect(workflow.dueLabel).toBeNull()
  })

  it('is finished when everything has been paid', () => {
    const row = month({ raised: 2, signed: 2, sent: 2, paid: 2 })
    const workflow = describeMonth(row, 'acme', NOW)
    expect(isFinished(row)).toBe(true)
    expect(workflow.settled).toBe(true)
    expect(workflow.next).toBeNull()
  })
})

describe('a month nobody was paid to teach', () => {
  it('is finished rather than blocked', () => {
    // Self-practice is a normal week in a dance club. A month of it is not an
    // unraised claim, and treating it as one would put a permanent red mark
    // on the home screen that no action can clear.
    const row = month({ taught: 0, sessions: 4 })
    const workflow = describeMonth(row, 'acme', NOW)

    expect(isFinished(row)).toBe(true)
    expect(workflow.settled).toBe(true)
    expect(workflow.next).toBeNull()
    expect(stateOf(workflow, 'raise')).toBe('skipped')
  })

  it('carries no deadline, because there is nothing to submit', () => {
    const workflow = describeMonth(month({ taught: 0, sessions: 4 }), 'acme', NOW)
    expect(workflow.dueAt).toBeNull()
    expect(workflow.dueLabel).toBeNull()
  })

  it('still asks for the classes when the month is empty altogether', () => {
    const row = month({ taught: 0, sessions: 0 })
    const workflow = describeMonth(row, 'acme', NOW)
    expect(workflow.settled).toBe(false)
    expect(workflow.next?.label).toContain('Record')
  })
})

describe('a coach who cannot be invoiced', () => {
  it('says whose details are missing rather than offering a button that refuses', () => {
    // No bank details means no invoice, ever, until somebody fills them in.
    // Without this the workflow says "raise the rest" for the rest of the
    // financial year and the button it offers fails every time.
    const workflow = describeMonth(
      month({ raised: 1, blocked: [{ name: 'Jin Tan', missing: ['bank'] }] }),
      'acme',
      NOW
    )
    expect(stateOf(workflow, 'raise')).toBe('blocked')
    expect(workflow.next?.label).toBe('Fill in Jin’s details')
    expect(workflow.next?.href).toBe('/acme/instructors')
    expect(workflow.steps.find((s) => s.key === 'raise')?.note).toContain('Jin Tan has no bank')
  })

  it('still says raise when somebody raisable is left', () => {
    // Three taught, one raised, one blocked — the third can be raised now.
    const workflow = describeMonth(
      month({ taught: 3, raised: 1, blocked: [{ name: 'Jin Tan', missing: ['rate'] }] }),
      'acme',
      NOW
    )
    expect(stateOf(workflow, 'raise')).toBe('current')
    expect(workflow.next?.label).toBe('Raise the rest')
  })
})

describe('exactly one step is live', () => {
  it('does not call signing and sending both current at once', () => {
    // Two raised, one signed. Deciding each step in isolation made Signed and
    // Sent both "current", and once one had gone, Paid as well — a spine that
    // has stopped saying where the work is.
    const workflow = describeMonth(month({ raised: 2, signed: 1 }), 'acme', NOW)
    const live = workflow.steps.filter((step) => step.state === 'current')
    expect(live.map((step) => step.key)).toEqual(['sign'])
    expect(stateOf(workflow, 'send')).toBe('todo')
    expect(stateOf(workflow, 'paid')).toBe('todo')
  })

  it('holds to one even when a later step is further along than an earlier one', () => {
    const workflow = describeMonth(month({ raised: 2, signed: 1, sent: 1 }), 'acme', NOW)
    expect(workflow.steps.filter((step) => step.state === 'current')).toHaveLength(1)
  })
})

describe('a month whose documents were voided', () => {
  it('asks for it to be raised again, with a new number', () => {
    // A voided document keeps its reference; the replacement gets a fresh one.
    const row = month({ taught: 1, raised: 0, voided: 1 })
    const workflow = describeMonth(row, 'acme', NOW)

    expect(isFinished(row)).toBe(false)
    expect(stateOf(workflow, 'raise')).toBe('current')
    expect(workflow.steps.find((s) => s.key === 'raise')?.note).toContain('A document was voided')
    expect(workflow.next?.label).toBe('Raise it again')
    // Nothing has been raised, so there is nothing for the later steps to
    // count. "Signed 0" there reads as a tally rather than an absence.
    expect(workflow.steps.find((s) => s.key === 'sign')?.detail).toBeUndefined()
  })

  it('is finished once a replacement has been raised', () => {
    const row = month({ taught: 1, raised: 1, signed: 1, sent: 1, paid: 1, voided: 1 })
    expect(isFinished(row)).toBe(true)
  })
})

describe('the deadline', () => {
  it('matches what a raised document would store', () => {
    // Documents are dated the 15th of the following month and must reach OSL
    // within three working days of that. The fallback used to be the 15th
    // itself, so raising a document pushed its own displayed deadline three
    // days later than the home screen had been showing all week.
    // 15 September 2026 is a Tuesday; three working days on is Friday 18th.
    const workflow = describeMonth(month(), 'acme', NOW)
    expect(workflow.dueAt).toEqual(new Date(2026, 8, 18))
  })

  it('rolls into the next year for December, and over the weekend', () => {
    // 15 January 2027 is a Friday, so three working days is the Wednesday.
    const workflow = describeMonth(month({ year: 2026, month: 12 }), 'acme', new Date(2027, 0, 5))
    expect(workflow.dueAt).toEqual(new Date(2027, 0, 20))
  })

  it('prefers the deadline stored on the documents once they exist', () => {
    // Raised documents carry their own submission window — invoice date plus
    // three working days — which is stricter than the 15th.
    const stored = new Date(2026, 8, 9)
    const workflow = describeMonth(month({ raised: 2, dueAt: stored }), 'acme', NOW)
    expect(workflow.dueAt).toEqual(stored)
    expect(workflow.urgency).toBe('overdue')
  })
})

describe('how the month reads', () => {
  it('names the month in the subject and the link', () => {
    const workflow = describeMonth(month({ year: 2026, month: 1 }), 'acme', NOW)
    expect(workflow.subject).toBe('January 2026')
    expect(workflow.href).toBe('/acme/monthly-run?month=2026-01')
  })

  it('drops the fraction once a step is complete', () => {
    const workflow = describeMonth(month({ raised: 2, signed: 2 }), 'acme', NOW)
    expect(workflow.steps.find((s) => s.key === 'sign')?.detail).toBe('2')
    expect(workflow.steps.find((s) => s.key === 'send')?.detail).toBe('0 of 2')
  })
})

describe('a month paid outside the portal', () => {
  it('is finished with nothing raised, and asks for nothing', () => {
    const row = month({ year: 2026, month: 1, settledOutside: true })
    const workflow = describeMonth(row, 'acme', NOW)
    expect(isFinished(row)).toBe(true)
    expect(workflow.settled).toBe(true)
    expect(workflow.next).toBeNull()
    expect(workflow.dueAt).toBeNull()
    expect(workflow.restingState).toBe('Paid outside the portal.')
  })

  it('still has to see through a document that was raised here anyway', () => {
    const row = month({ settledOutside: true, raised: 1, signed: 1 })
    expect(isFinished(row)).toBe(false)
    expect(describeMonth(row, 'acme', NOW).settled).toBe(false)
  })

  it('is unfinished without the mark', () => {
    expect(isFinished(month({ year: 2026, month: 1 }))).toBe(false)
  })
})

describe('one coach sent, another not raised', () => {
  it('is not "with OSL", and keeps its deadline', () => {
    const row = month({ taught: 2, raised: 1, signed: 1, sent: 1 })
    const workflow = describeMonth(row, 'acme', NOW)
    expect(workflow.restingState ?? '').not.toMatch(/With OSL/)
    expect(workflow.dueAt).not.toBeNull()
    expect(workflow.next?.label).toBe('Raise the rest')
  })
})
