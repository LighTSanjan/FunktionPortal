'use client'

import { useActionState } from 'react'
import { saveFormSettings } from '@/modules/membership-form/form-actions'
import type { FormActionState } from '@/modules/membership-form/action-state'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'
import { Label } from '@/core/ui/label'
import { Notice } from '../../_components/ui'

/** The welcome note at the top of the form. */
export function FormSettings({
  orgSlug,
  termId,
  intro,
  locked,
}: {
  orgSlug: string
  termId: string
  intro: string | null
  locked: boolean
}) {
  const [state, act, pending] = useActionState<FormActionState, FormData>(saveFormSettings.bind(null, orgSlug), {
    error: null,
  })

  return (
    <form action={act} className="space-y-4">
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
