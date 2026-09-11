'use client'

import { useActionState } from 'react'
import { markDepositSubmitted, type FeeState } from '@/modules/fees/actions'

/**
 * Recording that the deposit form went to OSL.
 *
 * The portal composes nothing and sends nothing here — the form is an
 * attachment on an email the treasurer writes — so the only honest way to
 * know is to be told.
 */
export function FiledToggle({
  orgSlug,
  termId,
  filed,
}: {
  orgSlug: string
  termId: string
  filed: boolean
}) {
  const [state, act, pending] = useActionState<FeeState, FormData>(
    async () => markDepositSubmitted(orgSlug, termId, !filed),
    { error: null }
  )

  return (
    <form action={act} className="flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className={`self-start text-[12.5px] font-medium underline-offset-4 hover:underline disabled:opacity-50 ${
          filed ? 'text-text-subtle' : 'text-accent-600'
        }`}
      >
        {filed ? 'Not sent after all' : 'I have sent this to OSL'}
      </button>
      {state.error && (
        <span className="text-[12px] text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}
