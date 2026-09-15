'use client'

import { useActionState } from 'react'
import { markMonthPaidOutside } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'

/**
 * Saying a month was paid outside the portal, or taking it back.
 *
 * For the months before the portal existed. Their classes came in with the
 * attendance import, and without this each one sits on the home screen as a
 * month nobody has claimed for.
 */
export function PaidOutsideToggle({
  orgSlug,
  period,
  label,
  settled,
}: {
  orgSlug: string
  period: string
  label: string
  settled: boolean
}) {
  const [state, act, pending] = useActionState<ActionState, FormData>(
    async () => markMonthPaidOutside(orgSlug, period, !settled),
    { error: null }
  )

  return (
    <form action={act} className="flex flex-col gap-1.5">
      {settled ? (
        <button
          type="submit"
          disabled={pending}
          className="self-start text-[12.5px] font-medium text-text-subtle underline-offset-4 hover:underline disabled:opacity-50"
        >
          Not paid after all
        </button>
      ) : (
        <Button type="submit" variant="secondary" size="sm" loading={pending} className="self-start">
          Mark {label} as paid outside the portal
        </Button>
      )}
      {state.error && (
        <span className="text-[12px] text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}
