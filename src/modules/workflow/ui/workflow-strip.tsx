import Link from 'next/link'
import type { Workflow, Urgency } from '../types'
import { Steps } from './steps'

const DUE_TONE: Record<Urgency, string> = {
  overdue: 'bg-danger/10 text-danger',
  urgent: 'bg-danger/10 text-danger',
  soon: 'bg-warning/12 text-warning',
  normal: 'bg-surface-hover text-text-muted',
}

/**
 * The same job, along the top of the screen that advances it.
 *
 * So that arriving from anywhere — a link, a bookmark, a browser back button
 * — still answers where you are in the sequence. The card on the home screen
 * and this are the same data; a stepper that only exists on the home screen
 * is a stepper you have already left behind by the time you need it.
 */
export function WorkflowStrip({ workflow }: { workflow: Workflow }) {
  return (
    <section
      className="rounded-[var(--radius-md)] border border-border bg-paper px-4 py-3"
      aria-label={`${workflow.title}: progress`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Steps steps={workflow.steps} compact />
        <div className="flex items-center gap-3">
          {workflow.dueLabel && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${DUE_TONE[workflow.urgency]}`}
            >
              {workflow.dueLabel}
            </span>
          )}
          {workflow.next && (
            <Link
              href={workflow.next.href}
              className="text-[12.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              {workflow.next.label}
            </Link>
          )}
        </div>
      </div>
      {!workflow.next && workflow.restingState && (
        <p className="mt-2 text-[12px] text-text-subtle">{workflow.restingState}</p>
      )}
    </section>
  )
}
