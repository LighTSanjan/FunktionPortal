'use client'

import { useActionState } from 'react'
import { claimStudentId, type FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

/**
 * Tell the club which roster row is you.
 *
 * Asks for the student ID because it is the one thing every member has, it
 * never changes, and it is how the attendance sheets already identify people.
 * It does not link the account by itself — a student ID is printed on every
 * attendance sheet, so anybody could type yours. An exco member sees the
 * claim beside the roster row it matches and confirms it.
 */
export function ClaimForm({
  orgSlug,
  claimed,
}: {
  orgSlug: string
  /** Already claimed, waiting on the exco. */
  claimed: string | null
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    claimStudentId.bind(null, orgSlug),
    { error: null }
  )

  const waiting = claimed && !state.error

  return (
    <form action={formAction} className="mx-auto max-w-[26rem] space-y-3 text-left">
      {waiting ? (
        <p className="text-[13px] leading-relaxed text-text-muted">
          You said you are{' '}
          <span className="font-mono font-medium tabular-nums text-text">{claimed}</span>. An exco
          member will match that to the roster and confirm it — nothing more for you to do. If
          that number is wrong, put the right one in below.
        </p>
      ) : (
        <p className="text-[13px] leading-relaxed text-text-muted">
          Tell the club your student ID and an exco member will match you to the roster.
        </p>
      )}

      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Student ID</span>
          <Input
            name="studentId"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Student ID, e.g. 1001234"
            defaultValue={claimed ?? ''}
            required
            className="font-mono tabular-nums"
          />
        </label>
        <Button type="submit" variant={waiting ? 'secondary' : 'primary'} loading={pending}>
          {waiting ? 'Change' : 'Send'}
        </Button>
      </div>

      {state.error && (
        <p className="text-[12.5px] text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
