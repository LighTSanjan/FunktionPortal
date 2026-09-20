'use client'

import { useActionState, useState } from 'react'
import { closeCollection } from '@/modules/fees/actions'
import type { FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'
import { Notice } from '../../_components/ui'

/**
 * Banking in. Asked twice, because it cannot be undone.
 *
 * With nothing on the OSL route it is closing rather than banking: the same
 * freeze, no deposit form, and worded as what it is.
 */
export function CloseButton({
  orgSlug,
  termId,
  bankable,
  nothingToBank = false,
  blockedReason,
}: {
  orgSlug: string
  termId: string
  /** What will be banked in, already formatted. */
  bankable: string
  nothingToBank?: boolean
  /** Why the collection cannot close yet. The linked checklist sits above. */
  blockedReason?: string
}) {
  const [sure, setSure] = useState(false)
  const [state, close, pending] = useActionState<FeeState, FormData>(
    async () => closeCollection(orgSlug, termId),
    { error: null }
  )

  return (
    <form action={close} className="space-y-3">
      {blockedReason && (
        <div id="close-collection-blocked">
          <Notice tone="warning">
            {blockedReason} Use the checklist above to resolve it.
          </Notice>
        </div>
      )}
      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}
      {sure && !blockedReason ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-text">
            {nothingToBank
              ? 'This can’t be undone. Close it with nothing to bank in?'
              : `This can’t be undone. Bank in ${bankable}?`}
          </span>
          <Button type="submit" variant="danger" loading={pending}>
            {nothingToBank ? 'Yes, close it' : 'Yes, bank it in'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSure(false)}>
            Not yet
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setSure(true)}
          disabled={Boolean(blockedReason)}
          aria-describedby={blockedReason ? 'close-collection-blocked' : undefined}
        >
          {nothingToBank ? 'Close the collection' : `Bank in ${bankable}`}
        </Button>
      )}
    </form>
  )
}
