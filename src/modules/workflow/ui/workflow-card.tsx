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
 * One job, resumable.
 *
 * The whole card answers four questions in the order somebody under deadline
 * asks them: what is this, when is it due, how far am I, what do I do next.
 * The next action is a single button rather than a list of everything
 * possible — a screen that offers six equal choices has not decided anything
 * on the reader's behalf, which is the work it was supposed to do.
 */
export function WorkflowCard({ workflow, delayMs = 0 }: { workflow: Workflow; delayMs?: number }) {
  return (
    <section
      className="rise-in flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-brand-ink bg-surface"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
      aria-labelledby={`wf-${workflow.id}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 id={`wf-${workflow.id}`} className="text-[14.5px] font-semibold text-text">
            {workflow.title}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-text-muted">{workflow.subject}</p>
        </div>
        {workflow.dueLabel && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${DUE_TONE[workflow.urgency]}`}
          >
            {workflow.dueLabel}
          </span>
        )}
      </div>

      <div className="flex-1 px-5 py-4">
        <Steps steps={workflow.steps} />
      </div>

      <div className="border-t border-border px-5 py-3.5">
        {workflow.next ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={workflow.next.href}
              className="inline-flex items-center rounded-[var(--radius-sm)] bg-accent-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-700"
            >
              {workflow.next.label}
            </Link>
            <Link
              href={workflow.href}
              className="text-[12.5px] font-medium text-text-muted underline-offset-4 hover:text-text hover:underline"
            >
              Open
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[12.5px] leading-relaxed text-text-muted">
              {workflow.restingState ?? 'Nothing to do here.'}
            </p>
            <Link
              href={workflow.href}
              className="shrink-0 text-[12.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              Open
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
