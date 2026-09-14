'use client'

import { useActionState } from 'react'
import { inviteByEmail, type InvitationState } from '@/actions/invitations'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

export function InviteForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState<InvitationState, FormData>(
    inviteByEmail.bind(null, orgSlug),
    { error: null }
  )

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          name="email"
          type="email"
          required
          placeholder="coach@gmail.com"
          aria-label="Email address to invite"
          className="sm:flex-1"
        />
        <Button type="submit" loading={pending}>
          Invite
        </Button>
      </div>
      {state.error && (
        <p className="text-[13px] text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.invited && !state.error && (
        <p className="text-[13px] text-success" role="status">
          Invited {state.invited}. Tell them to sign in with that address.
        </p>
      )}
    </form>
  )
}
