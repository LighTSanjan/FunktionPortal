'use client'

import { useActionState } from 'react'
import { markDepositSubmitted } from '@/modules/fees/collection-actions'
import { type FeeState } from '@/modules/fees/action-state'
import { Button } from '@/core/ui/button'

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
      <Button type="submit" variant={filed ? 'ghost' : 'secondary'} loading={pending} className="self-start">
        {filed ? 'Not sent after all' : 'I have sent this to OSL'}
      </Button>
      {state.error && (
        <span className="text-[12px] text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}
