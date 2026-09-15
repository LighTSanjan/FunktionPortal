'use client'

import { useActionState, useState } from 'react'
import type { FeeTier } from '@prisma/client'
import { saveFormSettings, type FormActionState } from '@/modules/membership-form/actions'
import { MEMBER_CHOICES, TIER_LABEL } from '@/modules/fees/tiers'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'
import { Label } from '@/core/ui/label'
import { Notice, pillClass } from '../../_components/ui'

/** The welcome note at the top of the form, and which fees people may pick. */
export function FormSettings({
  orgSlug,
  termId,
  intro,
  tierChoices,
  prices,
  locked,
}: {
  orgSlug: string
  termId: string
  intro: string | null
  tierChoices: FeeTier[]
  /** "$70.00" for each fee a member could pick. */
  prices: Record<string, string>
  locked: boolean
}) {
  const [state, act, pending] = useActionState<FormActionState, FormData>(saveFormSettings.bind(null, orgSlug), {
    error: null,
  })
  const [picked, setPicked] = useState<FeeTier[]>(tierChoices)

  return (
    <form action={act} className="space-y-5">
      <input type="hidden" name="termId" value={termId} />

      <div className="space-y-1.5">
        <Label htmlFor="intro">Welcome note</Label>
        <Textarea
          id="intro"
          name="intro"
          rows={3}
          maxLength={1500}
          disabled={locked}
          defaultValue={intro ?? ''}
          placeholder="Welcome back to FUNKtion! Fill this in to join for the term — it takes two minutes."
        />
        <p className="text-[12px] text-text-subtle">Shown at the top of the form. Leave it blank for none.</p>
      </div>

      <fieldset className="space-y-2" disabled={locked}>
        <legend className="text-[13px] font-medium text-text">Fees people can pick for themselves</legend>
        <div className="flex flex-wrap gap-2">
          {MEMBER_CHOICES.map((tier) => (
            <label key={tier} className={pillClass(picked.includes(tier))}>
              <input
                type="checkbox"
                name="tierChoice"
                value={tier}
                checked={picked.includes(tier)}
                onChange={(event) =>
                  setPicked((now) => (event.target.checked ? [...now, tier] : now.filter((t) => t !== tier)))
                }
                className="accent-[var(--brand-ink)]"
              />
              {TIER_LABEL[tier]}
              <span className="tabular-nums text-text-subtle">{prices[tier]}</span>
            </label>
          ))}
        </div>
        <p className="max-w-[68ch] text-[12px] leading-relaxed text-text-subtle">
          Someone who picks a cheaper fee than the roster has for them is flagged for you to check. A fee you set
          for someone yourself always wins, and they can&rsquo;t change it. Untick them all and nobody picks: everyone
          pays what the roster or you say.
        </p>
      </fieldset>

      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}
      {state.ok && !state.error && (
        <Notice tone="success" role="status">
          Saved.
        </Notice>
      )}

      {!locked && (
        <Button type="submit" loading={pending}>
          Save
        </Button>
      )}
    </form>
  )
}
