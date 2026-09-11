'use client'

import { useActionState } from 'react'
import { linkMemberAccount, type FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'
import { Select } from '@/core/ui/select'

export function LinkForm({
  orgSlug,
  account,
  members,
}: {
  orgSlug: string
  account: { userId: string; name: string; email: string }
  members: { id: string; fullName: string }[]
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    linkMemberAccount.bind(null, orgSlug),
    { error: null }
  )

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="userId" value={account.userId} />

      <div className="min-w-0">
        <p className="text-[13.5px] font-medium">{account.name}</p>
        <p className="text-[12.5px] text-text-muted">{account.email}</p>
        {state.error && (
          <p className="mt-1 text-[12.5px] text-danger" role="alert">
            {state.error}
          </p>
        )}
      </div>

      <label className="min-w-[14rem] flex-1">
        <span className="sr-only">Roster row for {account.name}</span>
        <Select name="memberId" defaultValue="">
          <option value="" disabled>
            Which roster row is this?
          </option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName}
            </option>
          ))}
        </Select>
      </label>

      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        Link
      </Button>
    </form>
  )
}
