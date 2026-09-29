'use client'

import { useActionState } from 'react'
import { markMonthPaidOutside } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'
import { FormField } from '@/core/ui/form-field'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'
import { AlertTriangle, Check, WalletCards } from 'lucide-react'

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
        <div className="max-w-[34rem] space-y-3 rounded-[var(--radius-sm)] border border-border bg-paper p-3">
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            Reversing this keeps the recorded payments as void rows and removes them from the balances. The reason stays in the audit log.
          </p>
          <FormField label="Why reverse this record?" htmlFor="outside-reversal-reason" required>
            <Input
              id="outside-reversal-reason"
              name="reversalReason"
              minLength={5}
              maxLength={500}
              required
              placeholder="Bank statement shows this month was not paid"
            />
          </FormField>
          <Button type="submit" variant="danger" size="sm" loading={pending}>
            Reverse outside payment record
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-3 rounded-[var(--radius-sm)] border border-warning/25 bg-warning/8 px-3.5 py-3 text-[12.5px] leading-relaxed text-text-muted">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              Use this only when the transfer has already happened. The portal will add the
              expenses to the register and update the selected fund balances. You can reverse the
              record later, but a reason will be kept in the audit log.
            </p>
          </div>

          <fieldset className="overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface">
            <legend className="sr-only">Coach payment amounts and funds</legend>
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Coaches paid</p>
            </div>
            {(coaches ?? []).map((coach) => (
              <div key={coach.id} className="grid gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(10rem,1fr)_10rem_12rem] sm:items-end">
                <div className="self-center">
                  <p className="text-[13.5px] font-semibold text-text">{coach.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-text-subtle">
                    Expected from recorded classes: ${(coach.amountCents / 100).toFixed(2)}
                  </p>
                </div>
                <FormField label="Actual amount" htmlFor={`outside-amount-${coach.id}`} required>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-text-subtle">$</span>
                    <Input
                      id={`outside-amount-${coach.id}`}
                      name={`amount_${coach.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue={(coach.amountCents / 100).toFixed(2)}
                      required
                      className="pl-7 tabular-nums"
                    />
                  </div>
                </FormField>
                <FormField label="Paid from" htmlFor={`outside-fund-${coach.id}`} required>
                  <Select id={`outside-fund-${coach.id}`} name={`fund_${coach.id}`} defaultValue="SEED" required>
                    <option value="SEED">OSL Seed Fund</option>
                    <option value="INCOME">Income</option>
                  </Select>
                </FormField>
              </div>
            ))}
          </fieldset>

          <div className="grid gap-4 rounded-[var(--radius-sm)] border border-border bg-surface p-4 sm:grid-cols-2">
            <FormField label="Paid on" htmlFor="outside-paid-on" required>
              <Input id="outside-paid-on" name="paidOn" type="date" defaultValue={defaultPaidOn} required />
            </FormField>
            <FormField label="Payment reference" htmlFor="outside-reference" hint="Optional bank or OSL reference">
              <Input id="outside-reference" name="reference" maxLength={80} />
            </FormField>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="submit" size="md" loading={pending} className="self-start">
              <Check className="h-4 w-4" aria-hidden="true" />
              Save external payment
            </Button>
            <span className="flex items-center gap-1.5 text-[11.5px] text-text-subtle">
              <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
              Records {label} as paid; no claim documents are created.
            </span>
          </div>
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
