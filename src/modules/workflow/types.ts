/**
 * A job the treasurer is part-way through.
 *
 * The portal is organised around records — coaches, classes, invoices, terms
 * — and a treasurer is not. They arrive with a job ("it's the 8th, the coaches
 * need paying for last month") which spans four screens.
 *
 * A workflow holds that job together: the steps, which are done, which one is
 * live, when it is due, and the single next action. Built on the server from
 * the same rows the screens read, so it cannot claim a step is done that is
 * not.
 */
import { singaporeDay } from '@/lib/date-only'

export type StepState =
  /** Finished. */
  | 'done'
  /** Where the work is now. */
  | 'current'
  /** Not started, and reachable. */
  | 'todo'
  /** Cannot start until something outside this step is fixed. */
  | 'blocked'
  /** Deliberately skipped — there was nothing for it to do. */
  | 'skipped'

export interface WorkflowStep {
  key: string
  label: string
  state: StepState
  /** Progress in this step's own terms: "3 of 4", "12 to check". */
  detail?: string
  /** Why it is blocked, or what is left. One short sentence. */
  note?: string
  href?: string
}

export type Urgency = 'overdue' | 'urgent' | 'soon' | 'normal'

export interface NextAction {
  label: string
  href: string
  urgency: Urgency
}

export interface Workflow {
  id: 'coach-payments' | 'subscription'
  /** The job. */
  title: string
  /** Which instance of it: "August 2026", "Trimester 1". */
  subject: string
  /** The workflow's own screen. */
  href: string
  steps: WorkflowStep[]
  dueAt: Date | null
  /** How the deadline should read: "Due 15 September", "3 days late". */
  dueLabel: string | null
  urgency: Urgency
  /**
   * The one thing to do next. Null when the job is finished or genuinely
   * waiting on somebody else.
   */
  next: NextAction | null
  /** Nothing left to do here. */
  settled: boolean
  /** Shown when settled or waiting: "With OSL, waiting on payment". */
  restingState: string | null
}

const DAY = 24 * 60 * 60 * 1000

/**
 * How a deadline should read, and how loudly.
 *
 * Days, not hours: every deadline in the guidelines is a date, and "in 14
 * hours" invites somebody to leave it until the morning of a submission that
 * has to be countersigned.
 */
export function deadline(dueAt: Date | null, now: Date): { label: string | null; urgency: Urgency } {
  if (!dueAt) return { label: null, urgency: 'normal' }

  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY)

  if (days < 0) {
    const late = Math.abs(days)
    return { label: `${late} day${late === 1 ? '' : 's'} late`, urgency: 'overdue' }
  }
  if (days === 0) return { label: 'Due today', urgency: 'urgent' }
  if (days === 1) return { label: 'Due tomorrow', urgency: 'urgent' }
  if (days <= 5) return { label: `${days} days left`, urgency: 'urgent' }
  if (days <= 14) return { label: `Due ${printed(dueAt)}`, urgency: 'soon' }
  return { label: `Due ${printed(dueAt)}`, urgency: 'normal' }
}

/**
 * The Singapore day, whatever the server's clock is set to. On a server in
 * UTC, half past midnight in Singapore is still yesterday, and every deadline
 * read a day further off than it is.
 */
function startOfDay(value: Date): number {
  return singaporeDay(value).getTime()
}

function printed(value: Date): string {
  return value.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })
}

/** "3 of 4", or "4" when everything is accounted for. */
export function count(done: number, total: number): string {
  return done === total ? String(total) : `${done} of ${total}`
}
