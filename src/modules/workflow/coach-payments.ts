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
import { addWorkingDays, OSL_SUBMISSION_WORKING_DAYS } from '@/modules/coach-claim/deadlines'

/**
 * How far back to look for classes that were never claimed for.
 *
 * A year, not a quarter. Unfinished work must not age out of the window: a
 * month with classes recorded and nothing raised is exactly the thing this is
 * for, and at four months it would have vanished from the home screen on a
 * month boundary while the claim was still owed. Months carrying an invoice
 * that is not yet paid are gathered regardless of age, below, so the only
 * thing this bounds is how far back an entirely unraised month is noticed.
 */
const MONTHS_OF_SESSIONS = 12

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
  /**
   * Documents raised and then voided. The reference stays issued and the
   * unique key on (org, coach, month) stays occupied, so the month cannot
   * simply be raised again — saying "raise it" here would be an instruction
   * the portal itself refuses.
   */
  voided: number
  /** The earliest submission deadline among raised, unsent documents. */
  dueAt: Date | null
  /**
   * Coaches who taught this month and cannot be invoiced — no bank details,
   * or no rate covering the month. Without this the workflow says "raise the
   * rest" forever and the button it offers refuses every time.
   */
  blocked: { name: string; missing: string[] }[]
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
  const earliest = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_OF_SESSIONS, 1)
  )

  const { sessions, invoices, instructors } = await dbAs(userId, async (tx) => ({
    instructors: await tx.instructor.findMany({
      where: { orgId },
      select: {
        id: true,
        fullName: true,
        bankName: true,
        bankAccountNo: true,
        rates: { select: { id: true }, take: 1 },
      },
    }),
    sessions: await tx.classSession.findMany({
      where: { orgId, heldOn: { gte: earliest } },
      select: { heldOn: true, instructorId: true },
    }),
    // Every invoice in the window, plus every unpaid invoice at any age. An
    // unpaid claim from eighteen months ago is still money the club is owed
    // and still a row OSL can ask about; it must not fall off the end of a
    // window chosen for a different purpose.
    invoices: await tx.invoice.findMany({
      where: {
        orgId,
        OR: [
          {
            OR: monthKeysSince(earliest, now).map(({ year, month }) => ({
              periodYear: year,
              periodMonth: month,
            })),
          },
          { status: { notIn: ['VOID', 'PAID'] } },
        ],
      },
      select: {
        periodYear: true,
        periodMonth: true,
        status: true,
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
        voided: 0,
        dueAt: null,
        blocked: [],
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
  const blockersFor = new Map(
    instructors.map((row) => {
      const missing: string[] = []
      if (!row.bankName?.trim()) missing.push('bank')
      if (!row.bankAccountNo?.trim()) missing.push('account number')
      if (row.rates.length === 0) missing.push('rate')
      return [row.id, { name: row.fullName, missing }]
    })
  )

  for (const [key, set] of coaches) {
    const [year, month] = key.split('-').map(Number)
    const row = state(year, month)
    row.taught = set.size
    row.blocked = [...set]
      .map((id) => blockersFor.get(id))
      .filter((entry): entry is { name: string; missing: string[] } => Boolean(entry))
      .filter((entry) => entry.missing.length > 0)
  }

  for (const invoice of invoices) {
    const row = state(invoice.periodYear, invoice.periodMonth)
    if (invoice.status === 'VOID') {
      row.voided += 1
      continue
    }
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

  // Never the month in progress. A claim covers a completed month — the run
  // screen defaults to last month for that reason — and one class recorded on
  // the 2nd would otherwise have the home screen asking to raise a month that
  // is not over, complete with a deadline three weeks in the future.
  const current = `${now.getFullYear()}-${now.getMonth() + 1}`

  const considered = [...states.values()]
    // Anything in them at all, including a month whose only documents were
    // voided — that is a state somebody has to resolve, not an empty month.
    .filter((row) => row.sessions > 0 || row.raised > 0 || row.voided > 0)
    .filter((row) => `${row.year}-${row.month}` !== current)
    .sort((a, b) => a.year - b.year || a.month - b.month)

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
    voided: 0,
    dueAt: null,
    blocked: [],
  }

  return describeMonth(chosen, orgSlug, now)
}

export function isFinished(row: MonthState): boolean {
  // A month whose documents were voided is unresolved whatever else is true
  // of it: the reference is spent, the unique key is occupied, and somebody
  // has to decide what replaces it.
  if (row.voided > 0 && row.raised < row.taught) return false
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
  // within three working days of that (§3.1.2). Before anything is raised
  // there is no stored deadline to read, so the same calculation is done
  // here — the fallback was the 15th itself, which meant raising a document
  // pushed its own displayed deadline three days later than the home screen
  // had been showing all week.
  const dueAt = row.dueAt ?? addWorkingDays(new Date(row.year, row.month, 15), OSL_SUBMISSION_WORKING_DAYS)
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

  // A coach missing bank details or a rate cannot be invoiced at all, and a
  // month whose documents were voided cannot simply be raised again — the
  // reference is spent and the unique key on (org, coach, month) is still
  // occupied. Both are blocked rather than merely unfinished, because the
  // button the step would otherwise offer refuses every time.
  const blockedByDetails = row.blocked.length > 0 && row.raised + row.blocked.length >= row.taught
  const blockedByVoid = row.voided > 0 && row.raised < row.taught

  const raiseNote = blockedByVoid
    ? `${row.voided === 1 ? 'A document for this month was' : `${row.voided} documents for this month were`} voided. Re-raising a voided month is not built yet — the reference is spent and the replacement needs a fresh one.`
    : row.blocked.length
      ? row.blocked.map((entry) => `${entry.name} has no ${entry.missing.join(', ')}`).join(' · ')
      : undefined

  /**
   * The steps, in order, with how far each has got.
   *
   * States are assigned across the whole sequence rather than per step, so
   * exactly one is "current". Deciding each in isolation marked Signed and
   * Sent both current the moment one of two documents was signed — and Paid
   * as well once one had gone — which is a spine that has stopped saying
   * where the work is.
   */
  const sequence: {
    key: string
    label: string
    done: number
    total: number
    blocked?: boolean
    note?: string
    action?: { label: string; href: string }
  }[] = [
    {
      key: 'raise',
      label: 'Documents raised',
      done: row.raised,
      total: row.taught,
      blocked: blockedByDetails || blockedByVoid,
      note: raiseNote,
      action: blockedByVoid
        ? { label: 'Look at the voided month', href: runHref }
        : blockedByDetails
          ? {
              label:
                row.blocked.length === 1
                  ? `Fill in ${firstName(row.blocked[0].name)}’s details`
                  : `Fill in ${row.blocked.length} coaches’ details`,
              href: `/${orgSlug}/instructors`,
            }
          : {
              label: row.raised === 0 ? `Raise ${subject}’s documents` : 'Raise the rest',
              href: runHref,
            },
    },
    {
      key: 'sign',
      label: 'Signed',
      done: row.signed,
      total: row.raised,
      action: { label: 'Read and sign them', href: runHref },
    },
    {
      key: 'send',
      label: 'Sent to OSL',
      done: row.sent,
      total: row.raised,
      action: { label: 'Send them to OSL', href: runHref },
    },
    {
      key: 'paid',
      label: 'Paid',
      done: row.paid,
      total: row.raised,
      note: row.sent > row.paid ? 'OSL pay on their own schedule.' : undefined,
      // Deliberately no action. Nothing the treasurer does makes OSL pay, and
      // calling it one would be the portal inventing work and then nagging.
    },
  ]

  let live = false
  for (const step of sequence) {
    const complete = step.total > 0 && step.done >= step.total
    const isCurrent = !complete && !live
    if (isCurrent) {
      live = true
      if (!next && step.action) next = step.action
    }
    steps.push({
      key: step.key,
      label: step.label,
      state: complete ? 'done' : isCurrent ? (step.blocked ? 'blocked' : 'current') : 'todo',
      // Nothing to count is not the same as nothing done: "Signed 0" beside a
      // month where no document has been raised reads like a tally rather
      // than an absence.
      detail: step.total > 0 ? count(step.done, step.total) : undefined,
      note: step.note,
      href: runHref,
    })
  }

  const settled = isFinished(row)
  // Everything has gone; what is left is OSL's to do.
  const withOsl = row.raised > 0 && row.sent === row.raised && row.paid < row.raised

  return {
    id: 'coach-payments',
    title: 'Coach payments',
    subject,
    href: runHref,
    steps,
    // A submission deadline that has been met stops being a deadline.
    dueAt: withOsl || settled ? null : dueAt,
    dueLabel: withOsl || settled ? null : dueLabel,
    urgency: withOsl || settled ? 'normal' : urgency,
    next: next ? { ...next, urgency } : null,
    settled,
    restingState: settled
      ? 'Paid in full.'
      : withOsl
        ? `With OSL since ${subject}. Waiting on payment.`
        : null,
  }
}

type NextOrNull = { label: string; href: string } | null

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name
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
