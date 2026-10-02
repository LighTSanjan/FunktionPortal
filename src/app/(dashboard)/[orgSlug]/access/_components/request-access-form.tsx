'use client'

import { useActionState } from 'react'
import { requestAccess, type AccessActionState } from '@/actions/access'
import { Button } from '@/core/ui/button'
import { Select } from '@/core/ui/select'
import { Textarea } from '@/core/ui/textarea'
import { FormField } from '@/core/ui/form-field'

export function RequestAccessForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState<AccessActionState, FormData>(
    requestAccess.bind(null, orgSlug),
    { error: null }
  )

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <FormField
        label="Which office"
        htmlFor="requestedOffice"
        required
      >
        <Select id="requestedOffice" name="requestedOffice" defaultValue="TREASURER" required>
          <option value="PRESIDENT">President</option>
          <option value="VICE_PRESIDENT">Vice-President</option>
          <option value="TREASURER">Treasurer</option>
          <option value="ASSISTANT_TREASURER">Assistant Treasurer</option>
          <option value="SECRETARY">Secretary</option>
          <option value="OTHER">Other</option>
        </Select>
      </FormField>

      <FormField
        label="Why"
        htmlFor="reason"
        required
      >
        <Textarea id="reason" name="reason" rows={4} required minLength={20} />
      </FormField>

      <Button type="submit" loading={pending}>
        Send request
      </Button>
    </form>
  )
}
