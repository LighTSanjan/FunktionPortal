'use client'

import { useActionState } from 'react'
import { linkMemberAccount, type FeeState } from '@/modules/fees/actions'
import type { UnlinkedAccount } from '@/modules/fees/queries'
import { Button } from '@/core/ui/button'
import { Select } from '@/core/ui/select'

/**
 * Put an account against its roster row.
 *
 * Where the account has claimed a student ID that exactly one roster row
 * carries, that row is preselected and the claim is shown beside it — the
 * exco's job becomes checking one match rather than searching forty-five
 * names. It is still a person pressing the button: a student ID is printed on
 * every attendance sheet, so a claim is somebody's word, not proof.
 */
export function LinkForm({
  orgSlug,
  account,
  members,
}: {
  orgSlug: string
  account: UnlinkedAccount
  members: { id: string; fullName: string; studentId: string | null }[]
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    linkMemberAccount.bind(null, orgSlug),
    { error: null }
  )

  const suggested = members.find((member) => member.id === account.suggestedMemberId)

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="userId" value={account.userId} />

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">{account.name}</p>
        <p className="text-[12.5px] text-text-muted">{account.email}</p>
        {account.claimedStudentId && (
          <p className="mt-1 text-[12.5px] leading-relaxed">
            Says they are <span className="font-mono tabular-nums">{account.claimedStudentId}</span>
            {suggested ? (
              <span className="text-text-muted"> — that is {suggested.fullName} on the roster.</span>
            ) : (
              <span className="text-warning"> — no unlinked roster row carries that ID.</span>
            )}
          </p>
        )}
        {account.contested && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-danger">
            Another account has claimed the same student ID. Check with both before linking either.
          </p>
        )}
        {state.error && (
          <p className="mt-1 text-[12.5px] text-danger" role="alert">
            {state.error}
          </p>
        )}
      </div>

      <label className="min-w-[14rem]">
        <span className="sr-only">Roster row for {account.name}</span>
        <Select name="memberId" defaultValue={account.contested ? '' : (suggested?.id ?? '')}>
          <option value="" disabled>
            Which roster row is this?
          </option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName}
              {member.studentId ? ` · ${member.studentId}` : ''}
            </option>
          ))}
        </Select>
      </label>

      <Button
        type="submit"
        size="sm"
        variant={suggested && !account.contested ? 'primary' : 'secondary'}
        loading={pending}
      >
        {suggested && !account.contested ? 'Confirm' : 'Link'}
      </Button>
    </form>
  )
}
