'use client'

import { useActionState } from 'react'
import { decideAccessRequest, type AccessActionState } from '@/actions/access'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

export function DecisionForm({ orgSlug, requestId }: { orgSlug: string; requestId: string }) {
  const [state, formAction, pending] = useActionState<AccessActionState, FormData>(
    decideAccessRequest.bind(null, orgSlug, requestId),
    { error: null }
  )

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <Input
        name="decisionNote"
        placeholder="A note back to them (optional)"
        aria-label="Note to the requester"
      />

      <div className="flex flex-wrap gap-3">
        {/* Two submit buttons on one form, distinguished by value: the note
            belongs to whichever decision is made, so they share a form. */}
        <Button type="submit" name="decision" value="APPROVED" loading={pending}>
          Approve
        </Button>
        <Button type="submit" name="decision" value="REJECTED" variant="secondary" loading={pending}>
          Refuse
        </Button>
      </div>
    </form>
  )
}
