'use client'

import { useTransition } from 'react'
import { withdrawAccessRequest } from '@/actions/access'
import { Button } from '@/core/ui/button'

export function WithdrawButton({ orgSlug, requestId }: { orgSlug: string; requestId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="secondary"
      loading={pending}
      onClick={() => startTransition(() => void withdrawAccessRequest(orgSlug, requestId))}
    >
      Withdraw request
    </Button>
  )
}
