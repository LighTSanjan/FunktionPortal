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
      <Button type="submit" loading={pending}>
        Close the collection and bank {bankable}
      </Button>
    </form>
  )
}
