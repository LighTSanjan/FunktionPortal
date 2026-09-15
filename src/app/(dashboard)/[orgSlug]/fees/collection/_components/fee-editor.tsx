'use client'

import { useActionState, useState } from 'react'
import type { FeeTier } from '@prisma/client'
import { setMemberFees, type FeeState } from '@/modules/fees/actions'
import { TIER_CHOICES, TIER_LABEL, amountForTier, type TermRates } from '@/modules/fees/tiers'
import { formatSgd } from '@/modules/coach-claim/money'
import { Button } from '@/core/ui/button'

type Choice = FeeTier | 'ROSTER'

/**
 * Choosing what somebody pays this term — or several people at once.
 *
 * Each choice shows its price, so nobody picks "Half term" and discovers the
 * figure afterwards. "What the roster says" appears only where the exco have
 * already decided something, because that is the only time it undoes anything.
 */
export function FeeEditor({
  orgSlug,
  termId,
  memberIds,
  rates,
  current,
  hasArrangement,
  rosterReading,
  onDone,
  onCancel,
}: {
  orgSlug: string
  termId: string
  memberIds: string[]
  rates: TermRates
  /** The fee as it stands, for a single person. Null when editing several. */
  current: { tier: FeeTier; amountCents: number; note: string | null } | null
  hasArrangement: boolean
  /** "Confirmed → Full term", shown beside the option that goes back to it. */
  rosterReading?: string
  onDone: (result: FeeState) => void
  onCancel: () => void
}) {
  const [choice, setChoice] = useState<Choice>(current?.tier ?? 'HALF')
  const [state, act, pending] = useActionState<FeeState, FormData>(async (previous, formData) => {
    const result = await setMemberFees(orgSlug, previous, formData)
    if (!result.error) onDone(result)
    return result
  }, { error: null })

  const options: Choice[] = hasArrangement ? [...TIER_CHOICES, 'ROSTER'] : [...TIER_CHOICES]
  const who = memberIds.length === 1 ? 'this person' : `these ${memberIds.length} people`

  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="termId" value={termId} />
      {memberIds.map((id) => (
        <input key={id} type="hidden" name="memberId" value={id} />
      ))}

      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium text-text">What should {who} pay?</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const price =
              option === 'ROSTER'
                ? rosterReading
                : option === 'CUSTOM'
                  ? 'you choose'
                  : formatSgd(amountForTier(option, rates))
            return (
              <label
                key={option}
                className={`lapis-press flex cursor-pointer items-baseline gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                  choice === option
                    ? 'border-brand-ink bg-paper font-medium text-text'
                    : 'border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text'
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value={option}
                  checked={choice === option}
                  onChange={() => setChoice(option)}
                  className="sr-only"
                />
                {option === 'ROSTER' ? 'What the roster says' : TIER_LABEL[option]}
                {price && <span className="tabular-nums text-text-subtle">{price}</span>}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        {choice === 'CUSTOM' && (
          <label className="space-y-1">
            <span className="block text-[12px] text-text-muted">Amount (S$)</span>
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              autoFocus
              defaultValue={current?.tier === 'CUSTOM' ? (current.amountCents / 100).toFixed(2) : ''}
              className="lapis-field h-9 w-28 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[13px] tabular-nums text-text"
            />
          </label>
        )}
        {choice !== 'ROSTER' && (
          <label className="min-w-[12rem] flex-1 space-y-1">
            <span className="block text-[12px] text-text-muted">Note, if it helps (optional)</span>
            <input
              name="note"
              maxLength={200}
              defaultValue={current?.note ?? ''}
              placeholder="Joined in week 7"
              className="lapis-field h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[13px] text-text"
            />
          </label>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={pending}>
            Save fee
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      {state.error && (
        <p className="text-[12.5px] text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
