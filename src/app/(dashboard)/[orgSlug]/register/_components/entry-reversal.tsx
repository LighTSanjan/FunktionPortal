'use client'

import { useActionState, useState } from 'react'
import {
  restoreManualRegisterEntry,
  voidManualRegisterEntry,
  type RegisterActionState,
} from '@/modules/register/actions'
import { Button } from '@/core/ui/button'
import { FormField } from '@/core/ui/form-field'
import { Textarea } from '@/core/ui/textarea'

export function EntryReversal({
  orgSlug,
  entryId,
  voided,
}: {
  orgSlug: string
  entryId: string
  voided: boolean
}) {
  const [open, setOpen] = useState(false)
  const action = voided ? restoreManualRegisterEntry : voidManualRegisterEntry
  const [state, submit, pending] = useActionState<RegisterActionState, FormData>(
    action.bind(null, orgSlug, entryId),
    { error: null }
  )

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {voided ? 'Restore' : 'Void'}
      </Button>
    )
  }

  return (
    <form action={submit} className="min-w-[15rem] space-y-2 rounded-[var(--radius-sm)] border border-border bg-paper p-3">
      {state.error && <p className="text-[12px] leading-snug text-danger" role="alert">{state.error}</p>}
      <FormField
        label={voided ? 'Why restore it?' : 'Why void it?'}
        htmlFor={`reversal-reason-${entryId}`}
        required
      >
        <Textarea
          id={`reversal-reason-${entryId}`}
          name="reason"
          rows={2}
          minLength={5}
          maxLength={500}
          required
          placeholder={voided ? 'The bank statement confirms this was valid' : 'Duplicate entry from the bank statement'}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={voided ? 'secondary' : 'danger'} size="sm" loading={pending}>
          Confirm {voided ? 'restore' : 'void'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
