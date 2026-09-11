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
import { currentTerm, getTerm, listCollection, getDeposit } from '@/modules/fees/queries'
import { addWorkingDays } from '@/modules/coach-claim/deadlines'

export async function subscriptionWorkflow(
  userId: string,
  orgId: string,
  orgSlug: string,
  now: Date,
  termId?: string
): Promise<Workflow | null> {
  const term = termId ? await getTerm(userId, orgId, termId) : await currentTerm(userId, orgId)
  if (!term) return null

  const [{ rows, totals }, deposit] = await Promise.all([
    listCollection(userId, orgId, term.id),
    getDeposit(userId, orgId, term.id),
  ])

  const href = `/${orgSlug}/fees/collection?term=${term.id}`
  const owing = rows.filter((row) => row.amountCents > 0)
  const declared = owing.filter((row) => row.status !== null)
  const toCheck = owing.filter((row) => row.status === 'DECLARED')
  const decided = owing.filter((row) => row.status === 'CONFIRMED' || row.status === 'REJECTED')

  const steps: WorkflowStep[] = []
  let next: { label: string; href: string } | null = null

  const ratesSet = term.fullFeeCents > 0 && term.finalCollectionAt !== null
  steps.push({
    key: 'rates',
    label: 'Rates and dates',
    state: ratesSet ? 'done' : 'current',
    note: ratesSet ? undefined : 'OSL need two weeks’ notice before a collection opens.',
    href,
  })
  if (!ratesSet) next = { label: 'Set the rates and the dates', href }

  steps.push({
    key: 'qr',
    label: 'PayNow QR up',
    state: term.hasPaynowQr ? 'done' : 'current',
    note: term.hasPaynowQr ? undefined : 'Members can see what they owe and cannot pay it.',
    href,
  })
  if (!next && !term.hasPaynowQr) next = { label: 'Put this term’s QR up', href }

  // Waiting on the members. Shown as progress, never as the treasurer's
  // next action — chasing forty-five people is not a button.
  //
  // Only live once members can actually act. Marked current while the rates
  // or the QR are still missing, the card showed two steps in progress at
  // once, which is a spine that has stopped saying where the work is.
  const open = ratesSet && term.hasPaynowQr
  steps.push({
    key: 'declared',
    label: 'Members declared',
    state: !open ? 'todo' : declared.length >= owing.length && owing.length > 0 ? 'done' : 'current',
    detail: count(declared.length, owing.length),
    href,
  })

  const checkState =
    declared.length === 0 ? 'todo' : decided.length >= declared.length ? 'done' : 'current'
  steps.push({
    key: 'check',
    label: 'Checked against the statement',
    state: checkState,
    detail: count(decided.length, declared.length),
    note: toCheck.length > 0 ? 'Nobody decides their own.' : undefined,
    href,
  })
  if (!next && toCheck.length > 0) {
    next = {
      label: `Check ${toCheck.length} declaration${toCheck.length === 1 ? '' : 's'}`,
      href,
    }
  }

  steps.push({
    key: 'close',
    label: 'Collection closed',
    state: term.closed ? 'done' : toCheck.length === 0 && declared.length > 0 ? 'current' : 'todo',
    href,
  })
  if (!next && !term.closed && declared.length > 0 && toCheck.length === 0) {
    next = { label: 'Close the collection', href }
  }

  const filed = deposit?.submittedToOslAt !== null && deposit?.submittedToOslAt !== undefined
  steps.push({
    key: 'deposit',
    label: 'Deposit form filed',
    state: filed ? 'done' : term.closed ? 'current' : 'todo',
    href: term.closed ? `/${orgSlug}/fees/collection?term=${term.id}#deposit` : href,
  })
  if (!next && term.closed && !filed) {
    next = { label: 'Download and file the deposit form', href }
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
    title: 'Subscription collection',
    subject: term.name,
    href,
    steps,
    dueAt: filed ? null : dueAt,
    dueLabel,
    urgency: filed ? 'normal' : urgency,
    next: next ? { ...next, urgency } : null,
    settled,
    restingState: settled
      ? `Filed with OSL. ${totals.confirmed} member${totals.confirmed === 1 ? '' : 's'} paid.`
      : next === null && toCheck.length === 0 && declared.length < owing.length
        ? `Waiting on ${owing.length - declared.length} member${owing.length - declared.length === 1 ? '' : 's'} to declare.`
        : null,
  }
}
