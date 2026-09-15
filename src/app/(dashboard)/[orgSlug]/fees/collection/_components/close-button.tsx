'use client'

import { useActionState, useState } from 'react'
import { closeCollection } from '@/modules/fees/actions'
import type { FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'
import { Notice } from '../../_components/ui'

/** Banking in. Asked twice, because it cannot be undone. */
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
  const [sure, setSure] = useState(false)
  const [state, close, pending] = useActionState<FeeState, FormData>(
    async () => closeCollection(orgSlug, termId),
    { error: null }
  )

  return (
    <form action={close} className="space-y-3">
      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}
      {sure ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-text">This can&rsquo;t be undone. Bank in {bankable}?</span>
          <Button type="submit" variant="danger" loading={pending}>
            Yes, bank it in
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSure(false)}>
            Not yet
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setSure(true)}>
          Bank in {bankable}
        </Button>
      )}
    </form>
  )
}
