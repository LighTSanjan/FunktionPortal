'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { resendConfirmation, type AuthState } from '@/actions/auth'
import { Button } from '@/core/ui/button'

export function CheckEmail({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(resendConfirmation, {
    error: null,
  })

  return (
    <div className="lapis-plate rounded-[var(--radius-lg)] border border-brand-ink bg-surface p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="lapis-plate-sm mb-6 flex h-11 w-11 items-center justify-center rounded-full border border-brand-ink bg-accent-50 text-accent-600"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
          <path d="m3 7 8.15 5.43a1.5 1.5 0 0 0 1.7 0L21 7" />
        </svg>
      </div>

      <h1 className="text-[27px] font-semibold leading-tight tracking-[-0.02em] text-text">
        Check your email
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
        We sent a confirmation link to{' '}
        <span className="font-medium text-text">{email}</span>. Open it and you&rsquo;ll be
        signed in. You cannot sign in until you do.
      </p>

      <div className="mt-7 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-[13px] leading-relaxed text-text-muted">
        Nothing after a minute? Check spam — it comes from Supabase, not from a FUNKtion
        address, so filters sometimes catch it.
      </div>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="email" value={email} />
        {state.error && (
          <div
            className="mb-4 rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
            role="alert"
          >
            {state.error}
          </div>
        )}
        {state.awaitingConfirmation && !state.error && (
          <div
            className="mb-4 rounded-[var(--radius-sm)] border border-success/20 bg-success/8 p-3 text-[13px] text-success"
            role="status"
          >
            Sent again. It can take a minute to arrive.
          </div>
        )}
        <Button type="submit" variant="secondary" className="w-full" loading={pending}>
          Resend the link
        </Button>
      </form>

      <p className="mt-7 border-t border-border pt-5 text-[13.5px] text-text-muted">
        Wrong address?{' '}
        <Link href="/sign-up" className="font-medium text-accent-600 underline-offset-4 hover:underline">
          Sign up again
        </Link>{' '}
        ·{' '}
        <Link href="/sign-in" className="font-medium text-accent-600 underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
