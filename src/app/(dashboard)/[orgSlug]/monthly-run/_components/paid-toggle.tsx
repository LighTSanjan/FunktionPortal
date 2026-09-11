'use client'

import { useActionState } from 'react'
import { markPaid } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'

/**
 * Recording that OSL have paid.
 *
 * The portal cannot see OSL's accounts, so this is a person reporting what
 * happened somewhere else — which is exactly why it is reversible and why it
 * is worded as a report rather than as an instruction.
 */
export function PaidToggle({
  orgSlug,
  invoiceId,
  coachName,
  paid,
}: {
  orgSlug: string
  invoiceId: string
  coachName: string
  paid: boolean
}) {
  const [state, act, pending] = useActionState<ActionState, FormData>(
    async () => markPaid(orgSlug, invoiceId, !paid),
    { error: null }
  )

  return (
    <form action={act} className="inline-flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className={`text-[12.5px] font-medium underline-offset-4 hover:underline disabled:opacity-50 ${
          paid ? 'text-text-subtle' : 'text-accent-600'
        }`}
      >
        {paid
          ? 'Not paid after all'
          : `${coachName.split(/\s+/)[0]} has been paid`}
      </button>
      {state.error && (
        <span className="text-[12px] text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}
