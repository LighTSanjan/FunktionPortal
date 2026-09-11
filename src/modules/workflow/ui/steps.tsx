import { Check, Minus } from 'lucide-react'
import type { WorkflowStep } from '../types'

/**
 * The spine of a job: what is done, where the work is, what is still ahead.
 *
 * Deliberately not clickable as a whole. Every step links to the screen that
 * advances it, but the row itself is a status readout — a stepper that is
 * also a navigation control invites somebody to click "Signed" expecting to
 * sign, and land on a list.
 */
export function Steps({ steps, compact }: { steps: WorkflowStep[]; compact?: boolean }) {
  return (
    <ol className={compact ? 'flex flex-wrap items-center gap-x-1 gap-y-2' : 'space-y-2'}>
      {steps.map((step, i) => (
        <li
          key={step.key}
          className={compact ? 'flex items-center gap-1' : 'flex items-start gap-2.5'}
        >
          {compact && i > 0 && (
            <span aria-hidden="true" className="mx-0.5 text-text-subtle">
              ›
            </span>
          )}
          <Marker state={step.state} />
          <div className={compact ? 'flex items-baseline gap-1.5' : 'min-w-0 flex-1 pt-px'}>
            {/* Label and count are separate elements, so they need a gap put
                between them — inline, they render as "Signed1 of 2". */}
            <span className="flex items-baseline gap-1.5">
              <span
                className={`text-[12.5px] ${
                  step.state === 'current'
                    ? 'font-semibold text-text'
                    : step.state === 'done'
                      ? 'text-text-muted'
                      : 'text-text-subtle'
                }`}
              >
                {step.label}
              </span>
              {step.detail && (
                <span className="text-[12px] tabular-nums text-text-subtle">{step.detail}</span>
              )}
            </span>
            {!compact && step.note && (
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-subtle">{step.note}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Marker({ state }: { state: WorkflowStep['state'] }) {
  if (state === 'done') {
    return (
      <span
        aria-label="done"
        className="mt-px inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }
  if (state === 'skipped') {
    return (
      <span
        aria-label="not needed"
        className="mt-px inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-subtle"
      >
        <Minus className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span
        aria-label="in progress"
        className="mt-px inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2 border-accent-500"
      >
        <span className="h-[5px] w-[5px] rounded-full bg-accent-500" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span
      aria-label="not started"
      className="mt-px inline-block h-[15px] w-[15px] shrink-0 rounded-full border border-border-strong"
    />
  )
}
