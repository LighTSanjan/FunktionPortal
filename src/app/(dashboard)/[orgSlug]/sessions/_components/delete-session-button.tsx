'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { deleteSession } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'

export function DeleteSessionButton({
  orgSlug,
  sessionId,
  returnTo,
}: {
  orgSlug: string
  sessionId: string
  returnTo: string
}) {
  const router = useRouter()
  const [armed, setArmed] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  function remove() {
    startTransition(async () => {
      const result = await deleteSession(orgSlug, sessionId)
      if (result.error) {
        setError(result.error)
        setArmed(false)
        return
      }
      router.push(returnTo)
      router.refresh()
    })
  }

  return (
    <div className="text-right">
      <Button
        variant={armed ? 'danger' : 'secondary'}
        size="sm"
        loading={pending}
        onClick={() => (armed ? remove() : setArmed(true))}
      >
        {armed ? 'Delete this class?' : 'Delete'}
      </Button>
      {error && (
        <p className="mt-1.5 max-w-[36ch] text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
