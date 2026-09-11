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
    dueAt: null,
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

describe('the deadline', () => {
  it('falls on the 15th of the month after the classes', () => {
    const workflow = describeMonth(month(), 'acme', NOW)
    expect(workflow.dueAt).toEqual(new Date(2026, 8, 15))
  })

  it('rolls into the next year for December', () => {
    // new Date(2026, 12, 15) is January 2027, which is what is wanted — but
    // it is the kind of arithmetic worth pinning down.
    const workflow = describeMonth(month({ year: 2026, month: 12 }), 'acme', new Date(2027, 0, 5))
    expect(workflow.dueAt).toEqual(new Date(2027, 0, 15))
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
