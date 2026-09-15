/**
 * The term's subscription collection, as a job.
 *
 * Set the rates, put the QR up, members declare, the exco check each one
 * against the statement, close it, and file the deposit form. Six steps, two
 * of which are waiting on other people rather than on the treasurer — and
 * saying which is which is most of the value here.
 */
import 'server-only'
import { deadline, count, type Workflow, type WorkflowStep } from './types'
import {
  currentTerm,
  getTerm,
  listTerms,
  listCollection,
  getDeposit,
  type TermRow,
} from '@/modules/fees/queries'
import { addWorkingDays } from '@/modules/coach-claim/deadlines'

/**
 * The collection the treasurer is working on.
 *
 * The oldest term whose deposit form has not been filed, and only then the
 * current one. currentTerm() alone considers a term that is running or about
 * to start, so a closed term whose form was never sent to OSL simply vanished
 * from the home screen the day the next term began — which is the one case
 * where somebody most needs to be told, because OSL are waiting on it.
 */
async function termNeedingWork(userId: string, orgId: string): Promise<TermRow | null> {
  const terms = await listTerms(userId, orgId)
  const running = await currentTerm(userId, orgId)

  const unfiled = [...terms]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .find((term) => !term.closed || !term.filed)

  return unfiled ?? running ?? terms[0] ?? null
}

export async function subscriptionWorkflow(
  userId: string,
  orgId: string,
  orgSlug: string,
  now: Date,
  termId?: string
): Promise<Workflow | null> {
  const term = termId
    ? await getTerm(userId, orgId, termId)
    : await termNeedingWork(userId, orgId)
  if (!term) return null

  const [{ rows, totals }, deposit] = await Promise.all([
    listCollection(userId, orgId, term.id),
    getDeposit(userId, orgId, term.id),
  ])

  const href = `/${orgSlug}/fees/collection?term=${term.id}`
  const tabHref = (tab: string) => `${href}&tab=${tab}`
  const owing = rows.filter((row) => row.amountCents > 0)
  const declared = owing.filter((row) => row.status !== null)
  const paid = owing.filter((row) => row.status === 'CONFIRMED')
  const toCheck = owing.filter((row) => row.status === 'DECLARED')
  const decided = owing.filter((row) => row.status === 'CONFIRMED' || row.status === 'REJECTED')
  // A refused declaration is checked, but it is not money. The member has to
  // pay again, so they still owe — and a collection closed while they do is a
  // real decision, not a step that quietly completed itself.
  const unpaid = owing.filter((row) => row.status !== 'CONFIRMED')

  const filed = term.filed

  // Both collection dates, not just the final one. OSL want two weeks'
  // notice before a collection opens, which is a date the treasurer has to
  // have thought about — and a step that called itself done without it was
  // hiding the only part with a lead time on it.
  const ratesSet =
    term.fullFeeCents > 0 && term.finalCollectionAt !== null && term.collectionOpensAt !== null
  const open = ratesSet && term.hasPaynowQr

  const steps: WorkflowStep[] = []
  let next: { label: string; href: string } | null = null

  /**
   * The steps in order, with how far each has got and what to do about it.
   *
   * Assigned across the whole sequence so exactly one is "current" — deciding
   * each in isolation lit two at once whenever an early one was unfinished.
   */
  const sequence: {
    key: string
    label: string
    complete: boolean
    detail?: string
    note?: string
    /**
     * Show the note only while this is the step being worked on. A warning
     * about what closing does, printed while the QR is not even up yet, is a
     * warning about a decision weeks away — read once, then ignored.
     */
    noteWhenCurrent?: boolean
    href?: string
    action?: { label: string; href: string }
  }[] = [
    {
      key: 'rates',
      label: 'Rates and dates',
      complete: ratesSet,
      note: ratesSet ? undefined : 'OSL need two weeks’ notice before a collection opens.',
      href: tabHref('setup'),
      action: { label: 'Set the rates and the dates', href: tabHref('setup') },
    },
    {
      key: 'qr',
      label: 'PayNow QR up',
      complete: term.hasPaynowQr,
      note: term.hasPaynowQr ? undefined : 'Members can see what they owe and cannot pay it.',
      href: tabHref('setup'),
      action: { label: 'Put this term’s QR up', href: tabHref('setup') },
    },
    {
      key: 'declared',
      label: 'Members paid',
      // Done once everybody has something against their name — paid, said
      // they paid, or been refused. Refused still owe; the close step says so.
      complete: owing.length > 0 && declared.length >= owing.length,
      detail: owing.length > 0 ? count(paid.length, owing.length) : undefined,
      // Deliberately no action. Chasing forty-five people is not a button;
      // recording what the statement shows is done from the list itself.
    },
    {
      key: 'check',
      label: 'Checked against the statement',
      complete: declared.length > 0 && decided.length >= declared.length,
      detail: declared.length > 0 ? count(decided.length, declared.length) : undefined,
      note: toCheck.length > 0 ? 'Nobody decides their own.' : undefined,
      href: tabHref('check'),
      action:
        toCheck.length > 0
          ? {
              label: `Check ${toCheck.length} declaration${toCheck.length === 1 ? '' : 's'}`,
              href: tabHref('check'),
            }
          : undefined,
    },
    {
      key: 'close',
      label: 'Collection closed',
      complete: term.closed,
      note:
        !term.closed && unpaid.length > 0
          ? `${unpaid.length} ${unpaid.length === 1 ? 'member has' : 'members have'} still not paid. Closing banks what has been confirmed and leaves them owing.`
          : undefined,
      noteWhenCurrent: true,
      href: tabHref('close'),
      action: { label: 'Close the collection', href: tabHref('close') },
    },
    {
      key: 'deposit',
      label: 'Deposit form filed',
      complete: filed,
      href: tabHref('close'),
      action: { label: 'Download and file the deposit form', href: tabHref('close') },
    },
  ]

  let live = false
  for (const step of sequence) {
    const isCurrent = !step.complete && !live
    if (isCurrent) {
      live = true
      if (step.action) next = step.action
    }
    steps.push({
      key: step.key,
      label: step.label,
      state: step.complete ? 'done' : isCurrent ? 'current' : 'todo',
      detail: step.detail,
      note: step.noteWhenCurrent && !isCurrent ? undefined : step.note,
      href: step.href ?? href,
    })
  }

  // Waiting on members is not a reason to hide work the exco can do now.
  if (next === null && !term.closed && toCheck.length > 0) {
    next = { label: `Check ${toCheck.length} declaration${toCheck.length === 1 ? '' : 's'}`, href: tabHref('check') }
  }
  // Past the final collection, somebody who never paid is not going to, and
  // the collection still has to be closed.
  if (next === null && !term.closed && open && term.finalCollectionAt && term.finalCollectionAt < now) {
    next = { label: 'Close the collection', href: tabHref('close') }
  }

  // Which deadline is live depends on where the job is. Before closing, it is
  // the final collection date; after, the form is due one working day later.
  const dueAt = term.closed
    ? (deposit?.submissionDueAt ??
        (term.finalCollectionAt ? addWorkingDays(term.finalCollectionAt, 1) : null))
    : term.finalCollectionAt
  const { label: dueLabel, urgency } = deadline(filed ? null : dueAt, now)

  const settled = filed

  return {
    id: 'subscription',
    title: 'Membership fees',
    subject: term.name,
    href,
    steps,
    dueAt: filed ? null : dueAt,
    dueLabel,
    urgency: filed ? 'normal' : urgency,
    next: next ? { ...next, urgency } : null,
    settled,
    restingState: restingState(),
  }

  function restingState(): string | null {
    if (settled) {
      const stillOwing = unpaid.length
      const paid = `${totals.confirmed} member${totals.confirmed === 1 ? '' : 's'} paid`
      return stillOwing > 0
        ? `Filed with OSL. ${paid}; ${stillOwing} did not, and still owe.`
        : `Filed with OSL. ${paid}.`
    }
    // Nothing to collect at all: every roster row is charged nothing, which
    // happens when a rate is zero or everybody on the roster has left. Saying
    // nothing here left the card with no next action and no explanation.
    if (open && owing.length === 0) {
      return 'Nobody on the roster is being charged for this term. Check the rates if that is wrong.'
    }
    if (next === null && toCheck.length === 0 && paid.length < owing.length) {
      const waiting = owing.length - paid.length
      return `Waiting on ${waiting} member${waiting === 1 ? '' : 's'} to pay.`
    }
    return null
  }
}
