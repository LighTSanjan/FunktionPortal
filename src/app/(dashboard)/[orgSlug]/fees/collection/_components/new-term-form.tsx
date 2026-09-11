'use client'

import { useActionState } from 'react'
import { createTerm, type FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'

/**
 * Open a term.
 *
 * Rates are asked for here rather than deferred: a term with no rates charges
 * nothing, and a collection that quietly collects nothing is worse than one
 * that was never opened. The two collection dates are not — those depend on
 * OSL, and a treasurer opening a term in week one may not know them yet.
 */
export function NewTermForm({
  orgSlug,
  suggestion,
}: {
  orgSlug: string
  /** A plausible name and dates, so the common case is two clicks. */
  suggestion: { name: string; startDate: string; endDate: string }
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    createTerm.bind(null, orgSlug),
    { error: null }
  )

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <FormField label="What it is called" htmlFor="name" required hint="As members will see it">
        <Input id="name" name="name" defaultValue={suggestion.name} required maxLength={60} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Starts" htmlFor="startDate" required>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={suggestion.startDate}
            required
          />
        </FormField>
        <FormField label="Ends" htmlFor="endDate" required>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={suggestion.endDate}
            required
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Full term"
          htmlFor="fullFee"
          required
          hint="What a member joining at the start pays"
        >
          <Input
            id="fullFee"
            name="fullFee"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            required
            className="tabular-nums"
          />
        </FormField>
        <FormField label="Half term" htmlFor="halfFee" required hint="Joining part-way through">
          <Input
            id="halfFee"
            name="halfFee"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            required
            className="tabular-nums"
          />
        </FormField>
      </div>

      <p className="max-w-[64ch] text-[12.5px] leading-relaxed text-text-subtle">
        The collection dates and the PayNow QR come next, on the collection screen. OSL need two
        weeks&rsquo; notice before a collection opens, so there is no hurry to set them today.
      </p>

      <Button type="submit" loading={pending}>
        Open the term
      </Button>
    </form>
  )
}
