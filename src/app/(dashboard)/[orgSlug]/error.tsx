'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ErrorScene } from '@/core/ui/error-scene'
import { isStaleClientError } from '@/core/ui/stale-client'

export default function OrgError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}) {
  useEffect(() => {
    // The details go to the server log and the alert; never onto the page.
    console.error('[OrgError]', error)
  }, [error])

  // A tab older than the server, not a crash: reloading is the fix, and
  // "Try again" would post the same action this build no longer has.
  if (isStaleClientError(error)) {
    return (
      <ErrorScene
        kind="stale"
        actions={
          <>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="lapis-stack inline-flex h-11 items-center rounded-[var(--radius-md)] bg-accent-500 px-5 text-[14px] font-medium text-white hover:bg-accent-400"
            >
              Reload the page
            </button>
            {/* When reloading is not enough, somewhere that always is. */}
            <Link href="/" className="text-[14px] font-medium text-accent-600 underline-offset-4 hover:underline">
              Back to the home screen
            </Link>
          </>
        }
      />
    )
  }

  return (
    <ErrorScene
      kind="crash"
      reference={error.digest}
      body={
        <p>
          This page broke on our side, not yours. Trying again often works. If it keeps happening,
          tell the treasurer what you were doing{error.digest ? ' and read them the reference below' : ''}.
        </p>
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => (unstable_retry ?? reset)()}
            className="lapis-stack inline-flex h-11 items-center rounded-[var(--radius-md)] bg-accent-500 px-5 text-[14px] font-medium text-white hover:bg-accent-400"
          >
            Try again
          </button>
          <Link href="/" className="text-[14px] font-medium text-accent-600 underline-offset-4 hover:underline">
            Back to the home screen
          </Link>
        </>
      }
    />
  )
}
