'use client'

import { useActionState } from 'react'
import { markMonthPaidOutside } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'
import { FormField } from '@/core/ui/form-field'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'

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
  coaches,
  defaultPaidOn,
}: {
  orgSlug: string
  period: string
  label: string
  settled: boolean
  coaches?: { id: string; name: string; amountCents: number }[]
  defaultPaidOn?: string
}) {
  const [state, act, pending] = useActionState<ActionState, FormData>(
    async (_previous, formData) => markMonthPaidOutside(orgSlug, period, !settled, formData),
    { error: null }
  )

  return (
    <form action={act} className="flex flex-col gap-4">
      {settled ? (
        <button
          type="submit"
          disabled={pending}
          className="self-start text-[12.5px] font-medium text-text-subtle underline-offset-4 hover:underline disabled:opacity-50"
        >
          Not paid after all
        </button>
      ) : (
        <>
          <div className="grid gap-3">
            {(coaches ?? []).map((coach) => (
              <div key={coach.id} className="grid gap-3 rounded-[var(--radius-sm)] border border-border bg-paper p-3 sm:grid-cols-[1fr_10rem_12rem] sm:items-end">
                <p className="text-[13px] font-medium text-text">{coach.name}</p>
                <FormField label="Amount paid" htmlFor={`outside-amount-${coach.id}`} required>
                  <Input
                    id={`outside-amount-${coach.id}`}
                    name={`amount_${coach.id}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={(coach.amountCents / 100).toFixed(2)}
                    required
                    className="tabular-nums"
                  />
                </FormField>
                <FormField label="Paid from" htmlFor={`outside-fund-${coach.id}`} required>
                  <Select id={`outside-fund-${coach.id}`} name={`fund_${coach.id}`} defaultValue="SEED" required>
                    <option value="SEED">OSL Seed Fund</option>
                    <option value="INCOME">Income</option>
                  </Select>
                </FormField>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Paid on" htmlFor="outside-paid-on" required>
              <Input id="outside-paid-on" name="paidOn" type="date" defaultValue={defaultPaidOn} required />
            </FormField>
            <FormField label="Payment reference" htmlFor="outside-reference" hint="Optional bank or OSL reference">
              <Input id="outside-reference" name="reference" maxLength={80} />
            </FormField>
          </div>
          <Button type="submit" variant="secondary" size="sm" loading={pending} className="self-start">
            Record {label} as paid outside the portal
          </Button>
        </>
      )}
      {state.error && (
        <span className="text-[12px] text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}
