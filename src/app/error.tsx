'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ErrorScene } from '@/core/ui/error-scene'
import { isStaleClientError } from '@/core/ui/stale-client'

/**
 * Everything outside a club: signing in, proving an address, onboarding.
 *
 * Without this, a broken sign-in fell through to global-error.tsx, which
 * throws away the layout and shows the crash page for what is usually just a
 * tab older than the server. See stale-client.ts.
 */
export default function RootError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}) {
  const stale = isStaleClientError(error)

  useEffect(() => {
    // The details go to the browser console and the server log, never the page.
    console.error('[RootError]', error)
  }, [error])

  // The auth layout is gone with the page that broke, so this brings the band
  // and the gutter the 404 page brings.
  return (
    <main className="min-h-screen bg-bg px-4">
      <div aria-hidden="true" className="lapis-band -mx-4 h-[7px]" />
      {stale ? (
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
              <Link
                href="/sign-in"
                className="text-[14px] font-medium text-accent-600 underline-offset-4 hover:underline"
              >
                Start again from signing in
              </Link>
            </>
          }
        />
      ) : (
        <ErrorScene
          kind="crash"
          reference={error.digest}
          body={
            <p>
              This broke on our side, not yours. Trying again often works. If it keeps happening,
              tell the treasurer what you were doing
              {error.digest ? ' and read them the reference below' : ''}.
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
              <Link
                href="/sign-in"
                className="text-[14px] font-medium text-accent-600 underline-offset-4 hover:underline"
              >
                Back to signing in
              </Link>
            </>
          }
        />
      )}
    </main>
  )
}
