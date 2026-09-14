'use client'

import './globals.css'
import { ErrorScene } from '@/core/ui/error-scene'

/**
 * When even the root layout fails. It replaces the whole document, so it
 * brings its own html and body, and nothing it renders may need the layout.
 */
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}) {
  return (
    <html lang="en" className="light">
      <body className="min-h-screen bg-bg px-4 font-sans">
        <title>Something broke</title>
        <div aria-hidden="true" className="lapis-band -mx-4 h-[7px]" />
        <ErrorScene
          kind="crash"
          reference={error.digest}
          actions={
            <button
              type="button"
              onClick={() => (unstable_retry ?? reset)()}
              className="lapis-stack inline-flex h-11 items-center rounded-[var(--radius-md)] bg-accent-500 px-5 text-[14px] font-medium text-white hover:bg-accent-400"
            >
              Try again
            </button>
          }
        />
      </body>
    </html>
  )
}
