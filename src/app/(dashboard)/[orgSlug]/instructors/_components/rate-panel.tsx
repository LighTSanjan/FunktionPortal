'use client'

import { useActionState } from 'react'
import { addInstructorRate, type ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'
import { Card, CardContent, CardHeader, CardTitle } from '@/core/ui/card'

export interface RateRow {
  hourlyRateCents: number
  effectiveFrom: string
  note: string | null
}

/** Append rates so old invoices retain the rate that applied. */
export function RatePanel({
  orgSlug,
  instructorId,
  rates,
}: {
  orgSlug: string
  instructorId: string
  rates: RateRow[]
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addInstructorRate.bind(null, orgSlug, instructorId),
    { error: null }
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
          Rate history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {rates.length === 0 ? (
          <p className="text-[13px] text-warn">
            No rate on file. Every session has to bill at a rate somebody agreed, so no invoice
            will generate until there is one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-subtle">
                  <th className="py-2 pr-4 font-semibold">Effective from</th>
                  <th className="py-2 pr-4 font-semibold">Rate</th>
                  <th className="py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.effectiveFrom} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-mono tabular-nums">{rate.effectiveFrom}</td>
                    <td className="py-2 pr-4 font-mono tabular-nums">
                      ${(rate.hourlyRateCents / 100).toFixed(2)}/hr
                    </td>
                    <td className="py-2 text-text-muted">{rate.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={formAction} className="space-y-4 border-t border-border pt-5">
          {state.error && (
            <div className="rounded-[var(--radius-sm)] bg-danger/10 p-3 text-[13px] text-danger" role="alert">
              {state.error}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Hourly rate (S$)" htmlFor="hourlyRate" required>
              <Input
                id="hourlyRate"
                name="hourlyRate"
                type="number"
                step="0.01"
                min="0.01"
                required
              />
            </FormField>
            <FormField label="Effective from" htmlFor="effectiveFrom" required>
              <Input id="effectiveFrom" name="effectiveFrom" type="date" required />
            </FormField>
            <FormField label="Note" htmlFor="note" hint="e.g. the contract it comes from">
              <Input id="note" name="note" />
            </FormField>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" loading={pending}>
              Add rate
            </Button>
            {state.ok && (
              <span className="text-[13px] text-success" role="status">
                Added
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
