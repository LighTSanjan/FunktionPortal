'use client'

import { useActionState } from 'react'
import { createTerm } from '@/modules/fees/collection-actions'
import { type FeeState } from '@/modules/fees/action-state'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'
import { formatSgd } from '@/modules/coach-claim/money'

/**
 * Open a term.
 *
 * The first term asks for rates. Later terms inherit the preceding setup and
 * need one confirmation; the collection screen remains where rates are edited.
 */
export function NewTermForm({
  orgSlug,
  suggestion,
  previousTerm,
}: {
  orgSlug: string
  /** A plausible name and dates, so the common case is two clicks. */
  suggestion: { name: string; startDate: string; endDate: string }
  previousTerm?: {
    id: string
    fullFeeCents: number
    halfFeeCents: number
    exchangeFeeCents: number | null
  }
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

      {previousTerm ? (
        <>
          <input type="hidden" name="name" value={suggestion.name} />
          <input type="hidden" name="startDate" value={suggestion.startDate} />
          <input type="hidden" name="endDate" value={suggestion.endDate} />
          <input type="hidden" name="copyFromTermId" value={previousTerm.id} />
          <div className="rounded-[var(--radius-sm)] border border-border bg-paper p-4 text-[13px] leading-relaxed text-text">
            <p className="font-semibold">Start {suggestion.name}?</p>
            <p className="mt-1 text-text-muted">
              {suggestion.startDate} to {suggestion.endDate}. It will start with the same rates: full term{' '}
              <span className="font-medium tabular-nums text-text">{formatSgd(previousTerm.fullFeeCents)}</span>, half term{' '}
              <span className="font-medium tabular-nums text-text">{formatSgd(previousTerm.halfFeeCents)}</span>
              {previousTerm.exchangeFeeCents !== null && (
                <> and exchange <span className="font-medium tabular-nums text-text">{formatSgd(previousTerm.exchangeFeeCents)}</span></>
              )}.
            </p>
          </div>
          <p className="max-w-[64ch] text-[12.5px] leading-relaxed text-text-subtle">
            You can change the dates or rates after it starts, before opening its membership form.
          </p>
          <Button type="submit" loading={pending}>Start the new term</Button>
        </>
      ) : (
        <>
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
        </>
      )}
    </form>
  )
}
