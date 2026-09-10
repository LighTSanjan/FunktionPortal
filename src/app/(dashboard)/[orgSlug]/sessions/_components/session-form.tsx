'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { saveSession, type ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'
import { Textarea } from '@/core/ui/textarea'
import { FormField } from '@/core/ui/form-field'

export function SessionForm({
  orgSlug,
  sessionId = null,
  instructors,
  defaults,
  returnTo,
}: {
  orgSlug: string
  sessionId?: string | null
  instructors: { id: string; fullName: string; danceStyle: string }[]
  defaults?: { instructorId?: string; heldOn?: string; durationMinutes?: number; notes?: string }
  returnTo: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveSession.bind(null, orgSlug, sessionId),
    { error: null }
  )

  // The action returns rather than redirecting so the form can show its own
  // errors; navigating on success is this component's job.
  React.useEffect(() => {
    if (state.ok && !state.error) router.push(returnTo)
  }, [state.ok, state.error, router, returnTo])

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <FormField label="Who taught it" htmlFor="instructorId" required>
        <Select id="instructorId" name="instructorId" defaultValue={defaults?.instructorId ?? ''} required>
          <option value="" disabled>
            Pick a coach
          </option>
          {instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.fullName} — {instructor.danceStyle}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Date" htmlFor="heldOn" required>
          <Input id="heldOn" name="heldOn" type="date" defaultValue={defaults?.heldOn ?? ''} required />
        </FormField>

        <FormField
          label="Length"
          htmlFor="durationMinutes"
          required
          hint="Minutes. A standing class is usually 90."
        >
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={15}
            max={480}
            step={5}
            defaultValue={defaults?.durationMinutes ?? 90}
            required
          />
        </FormField>
      </div>

      <FormField
        label="Notes"
        htmlFor="notes"
        hint="Optional. A workshop, a make-up class, why it ran long."
      >
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaults?.notes ?? ''} />
      </FormField>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {sessionId ? 'Save changes' : 'Record class'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(returnTo)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
