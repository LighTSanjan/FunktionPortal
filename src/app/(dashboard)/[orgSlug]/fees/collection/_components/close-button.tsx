'use client'

import { useActionState } from 'react'
import { closeCollection } from '@/modules/fees/actions'
import type { FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'

export function CloseButton({
  orgSlug,
  termId,
  bankable,
}: {
  orgSlug: string
  termId: string
  /** What will be banked in, already formatted. */
  bankable: string
}) {
  const [state, close, pending] = useActionState<FeeState, FormData>(
    async () => closeCollection(orgSlug, termId),
    { error: null }
  )

  return (
    <form action={close} className="space-y-3">
      {state.error && (
        <p
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
        Closing allocates the next INC reference and derives the GST from {bankable} &mdash; the
        sum of what was actually confirmed on the official route, never a figure anybody types.
        The form is then due at OSL within one working day of the final collection date.
      </p>
      <Button type="submit" loading={pending}>
        Close the collection and raise the deposit form
      </Button>
    </form>
  )
}
