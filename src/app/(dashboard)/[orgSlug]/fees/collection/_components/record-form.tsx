'use client'

import { useActionState, useState } from 'react'
import { recordPayment, undoPayment, type FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'

/**
 * Recording a payment seen on the bank statement.
 *
 * For the people who paid and never opened the portal — which is most of the
 * roster. The reference is optional because some transfers carry none, but it
 * is the one thing that lets somebody find the line again later.
 */
export function RecordForm({
  orgSlug,
  termId,
  memberId,
  name,
  amount,
  onDone,
  onCancel,
}: {
  orgSlug: string
  termId: string
  memberId: string
  name: string
  amount: string
  onDone: () => void
  onCancel: () => void
}) {
  const [outside, setOutside] = useState(false)
  const [state, act, pending] = useActionState<FeeState, FormData>(async (previous, formData) => {
    const result = await recordPayment(orgSlug, previous, formData)
    if (!result.error) onDone()
    return result
  }, { error: null })

  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="route" value={outside ? 'UNOFFICIAL' : 'OFFICIAL'} />

      <p className="text-[12.5px] text-text">
        Record <span className="font-semibold tabular-nums">{amount}</span> from {name} as paid.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="block text-[12px] text-text-muted">
            Reference on the bank statement (optional)
          </span>
          <input
            name="reference"
            maxLength={64}
            autoFocus
            autoComplete="off"
            className="lapis-field h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 font-mono text-[12.5px] text-text"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={pending}>
            Save payment
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
        <input type="checkbox" checked={outside} onChange={(event) => setOutside(event.target.checked)} />
        Paid to the exco directly, not through the OSL collection
      </label>
      {outside && (
        <input
          name="reason"
          required
          maxLength={300}
          placeholder="Why, e.g. paid in cash after the collection closed"
          className="lapis-field h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[12.5px] text-text"
        />
      )}

      {state.error && (
        <p className="text-[12.5px] text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}

/** Taking a payment decision back, asked twice so it is never a stray click. */
export function UndoPayment({
  orgSlug,
  paymentId,
  label,
  onDone,
  onCancel,
}: {
  orgSlug: string
  paymentId: string
  label: string
  onDone: () => void
  onCancel: () => void
}) {
  const [state, act, pending] = useActionState<FeeState, FormData>(async () => {
    const result = await undoPayment(orgSlug, paymentId)
    if (!result.error) onDone()
    return result
  }, { error: null })

  return (
    <form action={act} className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] text-text">{label}</span>
      <Button type="submit" size="sm" variant="danger" loading={pending}>
        Yes, undo
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Keep it
      </Button>
      {state.error && (
        <span className="w-full text-[12.5px] text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}
