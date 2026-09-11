/**
 * The monthly coach payment run, as a job rather than a screen.
 *
 * Classes happen, the month's documents are raised from them, read, signed,
 * emailed to OSL by the 15th, and eventually paid. Five steps across four
 * screens, with one deadline that is not negotiable, and until now the only
 * way to know where you were was to visit each screen and work it out.
 */
import 'server-only'
import { dbAs } from '@/core/db'
import { deadline, count, type Workflow, type WorkflowStep } from './types'

/** How far back to look for a month that still needs something doing. */
const MONTHS_CONSIDERED = 4

export interface MonthState {
  year: number
  /** 1-12. */
  month: number
  /** Coaches with at least one class that month. Self-practice has none. */
  taught: number
  raised: number
  signed: number
  sent: number
  paid: number
  /** Classes recorded, coached or not. */
  sessions: number
  /** The earliest submission deadline among raised, unsent documents. */
  dueAt: Date | null
}

/**
 * The month the treasurer is working on.
 *
 * The oldest one in the window that is not finished, because the oldest is
 * the one closest to being late. When everything is settled it falls back to
 * last month, which is the one a claim would be for.
 */
export async function coachPaymentsWorkflow(
  userId: string,
  orgId: string,
  orgSlug: string,
  now: Date
): Promise<Workflow> {
  const earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_CONSIDERED, 1))

  const { sessions, invoices } = await dbAs(userId, async (tx) => ({
    sessions: await tx.classSession.findMany({
      where: { orgId, heldOn: { gte: earliest } },
      select: { heldOn: true, instructorId: true },
    }),
    invoices: await tx.invoice.findMany({
      where: {
        orgId,
        status: { not: 'VOID' },
        OR: monthKeysSince(earliest, now).map(({ year, month }) => ({
          periodYear: year,
          periodMonth: month,
        })),
      },
      select: {
        periodYear: true,
        periodMonth: true,
        signedAt: true,
        submittedToOslAt: true,
        paidAt: true,
        submissionDueAt: true,
      },
    }),
  }))

  const states = new Map<string, MonthState>()
  const state = (year: number, month: number): MonthState => {
    const key = `${year}-${month}`
    let found = states.get(key)
    if (!found) {
      found = {
        year,
        month,
        taught: 0,
        raised: 0,
        signed: 0,
        sent: 0,
        paid: 0,
        sessions: 0,
        dueAt: null,
      }
      states.set(key, found)
    }
    return found
  }

  // Coaches per month, counted once each: two classes by the same coach is
  // one invoice, and a step that read "2 of 1 raised" is worse than no step.
  const coaches = new Map<string, Set<string>>()
  for (const session of sessions) {
    const year = session.heldOn.getUTCFullYear()
    const month = session.heldOn.getUTCMonth() + 1
    state(year, month).sessions += 1
    if (!session.instructorId) continue
    const key = `${year}-${month}`
    const set = coaches.get(key) ?? new Set<string>()
    set.add(session.instructorId)
    coaches.set(key, set)
  }
  for (const [key, set] of coaches) {
    const [year, month] = key.split('-').map(Number)
    state(year, month).taught = set.size
  }

  for (const invoice of invoices) {
    const row = state(invoice.periodYear, invoice.periodMonth)
    row.raised += 1
    if (invoice.signedAt) row.signed += 1
    if (invoice.submittedToOslAt) row.sent += 1
    if (invoice.paidAt) row.paid += 1
    if (!invoice.submittedToOslAt && invoice.submissionDueAt) {
      row.dueAt =
        row.dueAt === null || invoice.submissionDueAt < row.dueAt
          ? invoice.submissionDueAt
          : row.dueAt
    }
  }

  const considered = monthKeysSince(earliest, now)
    .map(({ year, month }) => states.get(`${year}-${month}`) ?? null)
    .filter((row): row is MonthState => row !== null)
    // Only months that have anything in them at all.
    .filter((row) => row.sessions > 0 || row.raised > 0)

  const unfinished = considered.find((row) => !isFinished(row))
  const previous = previousMonth(now)
  const chosen = unfinished ?? considered[considered.length - 1] ?? {
    year: previous.year,
    month: previous.month,
    taught: 0,
    raised: 0,
    signed: 0,
    sent: 0,
    paid: 0,
    sessions: 0,
    dueAt: null,
  }

  return describeMonth(chosen, orgSlug, now)
}

export function isFinished(row: MonthState): boolean {
  // Nobody was paid to teach: there is nothing to claim and nothing to chase.
  if (row.taught === 0) return true
  return row.raised === row.taught && row.paid === row.raised
}

/**
 * One month's state as a workflow. Pure, and exported so the states that are
 * awkward to reach through the database — a month of self-practice, a coach
 * raised but never signed, everything paid — can be tested directly.
 */
export function describeMonth(row: MonthState, orgSlug: string, now: Date): Workflow {
  const period = `${row.year}-${String(row.month).padStart(2, '0')}`
  const runHref = `/${orgSlug}/monthly-run?month=${period}`
  const subject = new Date(Date.UTC(row.year, row.month - 1, 1)).toLocaleDateString('en-SG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  // Documents are dated the 15th of the following month and must reach OSL
  // within three working days of that. Before anything is raised there is no
  // stored deadline to read, so the month's own is used.
  const dueAt = row.dueAt ?? new Date(row.year, row.month, 15)
  const { label: dueLabel, urgency } = deadline(row.taught > 0 ? dueAt : null, now)

  const steps: WorkflowStep[] = []
  let next: NextOrNull = null

  steps.push({
    key: 'classes',
    label: 'Classes recorded',
    state: row.sessions > 0 ? 'done' : 'current',
    detail: row.sessions > 0 ? String(row.sessions) : undefined,
    note: row.sessions === 0 ? 'Everything below is built from these.' : undefined,
    href: `/${orgSlug}/sessions?month=${period}`,
  })

  if (row.sessions === 0) {
    next = { label: `Record ${subject}’s classes`, href: `/${orgSlug}/sessions?month=${period}` }
  }

  if (row.taught === 0) {
    // Self-practice only. A real state, and a finished one.
    steps.push({
      key: 'raise',
      label: 'Documents raised',
      state: 'skipped',
      note: 'Nobody was paid to teach this month, so there is nothing to claim.',
    })
    return {
      id: 'coach-payments',
      title: 'Coach payments',
      subject,
      href: runHref,
      steps,
      dueAt: null,
      dueLabel: null,
      urgency: 'normal',
      next: row.sessions === 0 && next ? { ...next, urgency: 'normal' } : null,
      settled: row.sessions > 0,
      restingState:
        row.sessions > 0 ? 'Nobody was paid to teach this month. Nothing to claim.' : null,
    }
  }

  const raiseState = stateOf(row.raised, row.taught, row.sessions > 0)
  steps.push({
    key: 'raise',
    label: 'Documents raised',
    state: raiseState,
    detail: count(row.raised, row.taught),
    href: runHref,
  })
  if (!next && row.raised < row.taught) {
    next = {
      label: row.raised === 0 ? `Raise ${subject}’s documents` : 'Raise the rest',
      href: runHref,
    }
  }

  steps.push({
    key: 'sign',
    label: 'Signed',
    state: stateOf(row.signed, row.raised, row.raised > 0),
    detail: count(row.signed, row.raised),
    href: runHref,
  })
  if (!next && row.signed < row.raised) {
    next = { label: 'Read and sign them', href: runHref }
  }

  steps.push({
    key: 'send',
    label: 'Sent to OSL',
    state: stateOf(row.sent, row.raised, row.signed > 0),
    detail: count(row.sent, row.raised),
    href: runHref,
  })
  if (!next && row.sent < row.signed) {
    next = { label: 'Send them to OSL', href: runHref }
  }

  steps.push({
    key: 'paid',
    label: 'Paid',
    state: stateOf(row.paid, row.raised, row.sent > 0),
    detail: count(row.paid, row.raised),
    note: row.sent > row.paid ? 'OSL pay on their own schedule.' : undefined,
    href: runHref,
  })
  if (!next && row.sent === row.raised && row.paid < row.raised) {
    // Not a next action: nothing the treasurer does makes OSL pay. It is a
    // resting state, and calling it an action would be the portal inventing
    // work.
    next = null
  }

  const settled = isFinished(row)

  return {
    id: 'coach-payments',
    title: 'Coach payments',
    subject,
    href: runHref,
    steps,
    dueAt: row.sent === row.raised && row.raised > 0 ? null : dueAt,
    dueLabel: row.sent === row.raised && row.raised > 0 ? null : dueLabel,
    urgency: row.sent === row.raised && row.raised > 0 ? 'normal' : urgency,
    next: next ? { ...next, urgency } : null,
    settled,
    restingState: settled
      ? 'Paid in full.'
      : row.sent === row.raised && row.raised > 0
        ? `With OSL since ${subject}. Waiting on payment.`
        : null,
  }
}

type NextOrNull = { label: string; href: string } | null

/**
 * Done when everything is accounted for, current when the step before it has
 * produced something to work on, and waiting otherwise.
 */
function stateOf(done: number, total: number, reachable: boolean) {
  if (total > 0 && done >= total) return 'done' as const
  if (!reachable) return 'todo' as const
  return 'current' as const
}

function previousMonth(now: Date): { year: number; month: number } {
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: previous.getFullYear(), month: previous.getMonth() + 1 }
}

/** Every (year, month) from `from` up to and including `now`'s month. */
function monthKeysSince(from: Date, now: Date): { year: number; month: number }[] {
  const keys: { year: number; month: number }[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  while (cursor <= end) {
    keys.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return keys
}
