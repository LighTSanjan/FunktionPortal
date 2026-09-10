'use client'

import { useActionState } from 'react'
import { updateProfile, type ProfileState } from '@/actions/profile'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'

export function ProfileForm({
  orgSlug,
  name,
  email,
}: {
  orgSlug: string
  name: string
  email: string
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfile.bind(null, orgSlug),
    { error: null }
  )

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
      {state.ok && !state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-success/20 bg-success/8 p-3 text-[13px] text-success"
          role="status"
        >
          Saved.
        </div>
      )}

      <FormField
        label="Name"
        htmlFor="name"
        required
        hint="Printed under your signature on the sheets you verify"
      >
        <Input id="name" name="name" defaultValue={name} required maxLength={120} />
      </FormField>

      {/* Read-only, and not merely disabled: the address is the Supabase
          account identity, so changing it here would silently disagree with
          the credential you actually sign in with. */}
      <FormField label="Email" htmlFor="email" hint="From the account you sign in with">
        <Input id="email" value={email} readOnly disabled />
      </FormField>

      <Button type="submit" loading={pending}>
        Save changes
      </Button>
    </form>
  )
}
