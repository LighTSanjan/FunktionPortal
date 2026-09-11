'use client'

import { useActionState, useState } from 'react'
import { confirmPayment, rejectPayment, type FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'

/**
 * Confirm or refuse one declaration.
 *
 * The refusal needs a reason before it will go through, because a refusal
 * somebody cannot answer is a refusal they bring to the treasurer in person —
 * which is the work this screen exists to avoid.
 */
export function DecideButtons({
  orgSlug,
  paymentId,
  memberName,
  ownDeclaration,
}: {
  orgSlug: string
  paymentId: string
  memberName: string
  /** You declared this one. Somebody else has to decide it. */
  ownDeclaration: boolean
}) {
  const [confirmState, confirm, confirming] = useActionState<FeeState, FormData>(
    confirmPayment.bind(null, orgSlug),
    { error: null }
  )
  const [rejectState, reject, rejecting] = useActionState<FeeState, FormData>(
    rejectPayment.bind(null, orgSlug),
    { error: null }
  )
  const [mode, setMode] = useState<'idle' | 'refusing' | 'unofficial'>('idle')

  const error = confirmState.error ?? rejectState.error

  if (ownDeclaration) {
    return (
      <p className="text-[12.5px] text-text-subtle">
        Your own — somebody else decides it.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      )}

      {mode === 'refusing' && (
        <form action={reject} className="space-y-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <Reason placeholder={`Why ${first(memberName)}'s payment did not match`} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="danger" loading={rejecting}>
              Refuse it
            </Button>
            <Cancel onClick={() => setMode('idle')} />
          </div>
        </form>
      )}

      {mode === 'unofficial' && (
        <form action={confirm} className="space-y-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <input type="hidden" name="route" value="UNOFFICIAL" />
          <Reason placeholder="Why this one is outside the OSL collection" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="secondary" loading={confirming}>
              Confirm, held outside OSL
            </Button>
            <Cancel onClick={() => setMode('idle')} />
          </div>
        </form>
      )}

      {mode === 'idle' && (
        <div className="flex flex-wrap items-center gap-2">
          <form action={confirm}>
            <input type="hidden" name="paymentId" value={paymentId} />
            <Button type="submit" size="sm" loading={confirming}>
              Confirm
            </Button>
          </form>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode('refusing')}>
            Refuse
          </Button>
          {/* The exception path in the guidelines: late or otherwise
              uncollectable money the exco end up holding themselves. */}
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode('unofficial')}>
            Outside OSL
          </Button>
        </div>
      )}
    </div>
  )
}

function Reason({ placeholder }: { placeholder: string }) {
  return (
    <input
      name="reason"
      required
      maxLength={300}
      autoFocus
      placeholder={placeholder}
      className="lapis-field h-8 w-full min-w-[16rem] rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[12.5px] text-text"
    />
  )
}

function Cancel({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onClick}>
      Cancel
    </Button>
  )
}

/** "Bo" from "Bo Tan" — enough to make a placeholder read like a sentence. */
function first(name: string): string {
  return name.split(/\s+/)[0] ?? name
}
