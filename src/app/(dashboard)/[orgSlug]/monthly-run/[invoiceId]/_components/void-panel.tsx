'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { voidMonth } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'
import { FormField } from '@/core/ui/form-field'

/**
 * Voiding a raised month, to correct it and raise it again.
 *
 * Out of the way at the foot of the page, closed until asked for, and asking
 * for a reason: the reason is kept beside the reference number for good,
 * because that number is never issued again.
 */
export function VoidPanel({
  orgSlug,
  invoiceId,
  reference,
  sent,
  paid,
}: {
  orgSlug: string
  invoiceId: string
  reference: string
  /** Already emailed to OSL, so they have to be told as well. */
  sent: boolean
  paid: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, act, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await voidMonth(orgSlug, invoiceId, prev, formData)
    // Back to the month on the board, where the coach is ready to raise again.
    if (result.ok && result.message) router.push(`/${orgSlug}/monthly-run?month=${result.message}`)
    return result
  }, { error: null })

  if (paid) {
    return (
      <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
        This month is recorded as paid, so it can&rsquo;t be voided. If that was a mistake, take the
        payment back first.
      </p>
    )
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
          Found a mistake? Void the month, correct its classes or the coach&rsquo;s details, and
          raise it again. {reference} stays issued with your reason beside it, and the new documents
          get the next number.
        </p>
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          Void this month
        </Button>
      </div>
    )
  }

  return (
    <form action={act} className="max-w-[68ch] space-y-3">
      {state.error && (
        <p
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
          role="alert"
        >
          {state.error}
        </p>
      )}
      {sent && (
        <p className="max-w-[68ch] rounded-[var(--radius-sm)] border border-warning/25 bg-warning/8 p-3 text-[13px] leading-relaxed">
          This month has already gone to OSL. The portal can&rsquo;t tell them, so{' '}
          <strong className="font-semibold">email OSL that {reference} is void</strong> before you
          send the replacement.
        </p>
      )}
      <FormField label="Why it's being voided" htmlFor="void-reason" required>
        <Textarea
          id="void-reason"
          name="reason"
          rows={2}
          maxLength={300}
          required
          placeholder="Wrong class on 12 Aug — Jin taught, not Kai"
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="danger" loading={pending}>
          Void {reference}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  )
}
