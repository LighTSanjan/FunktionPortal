'use client'

import { useActionState } from 'react'
import { markSubmitted } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'

/**
 * Sending is still a person writing an email.
 *
 * The portal composes the message and opens the mail client rather than
 * sending anything itself: the pack goes from the club's own address, which is
 * the address the Office of Finance already replies to, and a portal that sent
 * on the treasurer's behalf would be one more place for a submission to go
 * missing without anyone having a sent-items folder to check.
 */
export function SendPanel({
  orgSlug,
  invoiceId,
  to,
  subject,
  body,
  submittedOn,
}: {
  orgSlug: string
  invoiceId: string
  to: string | null
  subject: string
  body: string
  submittedOn: string | null
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    async () => markSubmitted(orgSlug, invoiceId),
    { error: null }
  )

  const mailto = `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  if (submittedOn) {
    return (
      <p className="text-[13.5px] leading-relaxed">
        Recorded as sent on <strong className="font-semibold">{submittedOn}</strong>.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <ol className="max-w-[68ch] space-y-2 pl-5 text-[13.5px] leading-relaxed text-text-muted [&>li]:list-decimal">
        <li>
          Open the print sheet and save it as a PDF. Both documents are on it, in order, which
          is the single PDF the guidelines ask for.
        </li>
        <li>Start the email below and attach that PDF.</li>
        <li>Come back and record it as sent, so the deadline stops counting.</li>
      </ol>

      <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[auto_1fr]">
        <dt className="text-text-subtle">To</dt>
        <dd className="m-0 font-medium">
          {to ?? (
            <span className="text-text-muted">
              No submission address is set for this organisation yet.
            </span>
          )}
        </dd>
        <dt className="text-text-subtle">Subject</dt>
        <dd className="m-0 font-medium">{subject}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/${orgSlug}/monthly-run/${invoiceId}/print`}
          target="_blank"
          rel="noopener"
          className="lapis-press inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3.5 text-[13px] font-medium text-text transition-colors hover:bg-surface-hover"
        >
          Open the print sheet
        </a>
        <a
          href={mailto}
          className="lapis-press inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3.5 text-[13px] font-medium text-text transition-colors hover:bg-surface-hover"
        >
          Start the email
        </a>
        <form action={submit}>
          <Button type="submit" loading={pending}>
            Record it as sent
          </Button>
        </form>
      </div>
    </div>
  )
}
