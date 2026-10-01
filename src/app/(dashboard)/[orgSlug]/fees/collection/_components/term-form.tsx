'use client'

import { useActionState } from 'react'
import { updateTerm } from '@/modules/fees/collection-actions'
import { type FeeState } from '@/modules/fees/action-state'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'

export function TermForm({
  orgSlug,
  values,
  locked,
}: {
  orgSlug: string
  values: {
    termId: string
    fullFee: string
    halfFee: string
    exchangeFee: string
    collectionOpensAt: string
    finalCollectionAt: string
  }
  /** Banked in; the rates are fixed now. */
  locked: boolean
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    updateTerm.bind(null, orgSlug),
    { error: null }
  )

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="termId" value={values.termId} />

      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}
      {state.ok && !state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-success/20 bg-success/8 p-3 text-[13px] text-success"
          role="status"
        >
          Saved.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Full term" htmlFor="fullFee" required>
          <Input
            id="fullFee"
            name="fullFee"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.fullFee}
            disabled={locked}
            required
            className="tabular-nums"
          />
        </FormField>
        <FormField label="Half term" htmlFor="halfFee" required>
          <Input
            id="halfFee"
            name="halfFee"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.halfFee}
            disabled={locked}
            required
            className="tabular-nums"
          />
        </FormField>
        <FormField label="Exchange" htmlFor="exchangeFee" hint="Blank charges the half rate">
          <Input
            id="exchangeFee"
            name="exchangeFee"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.exchangeFee}
            disabled={locked}
            className="tabular-nums"
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Collection opens"
          htmlFor="collectionOpensAt"
          hint="OSL need two weeks' notice to open the DBS Max wallet"
        >
          <Input
            id="collectionOpensAt"
            name="collectionOpensAt"
            type="date"
            defaultValue={values.collectionOpensAt}
            disabled={locked}
          />
        </FormField>
        <FormField
          label="Final collection"
          htmlFor="finalCollectionAt"
          hint="The deposit form is due one working day after this"
        >
          <Input
            id="finalCollectionAt"
            name="finalCollectionAt"
            type="date"
            defaultValue={values.finalCollectionAt}
            disabled={locked}
          />
        </FormField>
      </div>

      {!locked && (
        <Button type="submit" loading={pending}>
          Save the term
        </Button>
      )}
    </form>
  )
}
