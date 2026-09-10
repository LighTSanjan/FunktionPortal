'use client'

import { Suspense, useActionState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signIn, signInWithGoogle, resendConfirmation, type AuthState } from '@/actions/auth'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'
import { AuthCardShell } from '../_components/auth-card-shell'
import { GoogleButton } from '../_components/google-button'

const REDIRECT_ERRORS: Record<string, string> = {
  link_expired: 'That link has expired or was already used. Sign in below, or ask for a new one.',
  invalid_link: 'That link is not valid. Try the most recent email.',
  exchange_failed: 'Google sign-in did not complete. Try again.',
  google_unavailable: 'Google sign-in is not available right now. Use your email and password.',
  access_denied: 'Google sign-in was cancelled.',
}

export default function SignInPage() {
  return (
    // useSearchParams needs a suspense boundary; without one the whole route
    // opts out of static rendering.
    <Suspense fallback={<SignInForm redirectError={null} />}>
      <SignInWithParams />
    </Suspense>
  )
}

function SignInWithParams() {
  const code = useSearchParams().get('error')
  const message = code ? (REDIRECT_ERRORS[code] ?? 'Something went wrong signing you in.') : null
  return <SignInForm redirectError={message} />
}

function SignInForm({ redirectError }: { redirectError: string | null }) {
  const [state, formAction, pending] = useActionState(signIn, { error: null })

  // The form's own error wins: it is the more recent thing that happened.
  const error = state.error ?? redirectError

  return (
    <AuthCardShell
      title="Welcome back!"
      footer={
        <>
          Not signed up yet?{' '}
          <Link href="/sign-up" className="font-medium text-accent-600 underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form action={signInWithGoogle}>
        <GoogleButton>Continue with Google</GoogleButton>
      </form>

      <div className="my-6 flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
          or with email
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={formAction} className="space-y-4">
        {error && (
          <div
            className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
            role="alert"
          >
            {error}
          </div>
        )}

        <FormField label="Email" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@mymail.sutd.edu.sg"
            required
            autoComplete="email"
            defaultValue={state.email ?? ''}
          />
        </FormField>
        <FormField label="Password" htmlFor="password" required>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </FormField>

        <div className="-mt-1 text-right">
          <Link
            href="/forgot-password"
            className="text-[12.5px] font-medium text-text-muted underline-offset-4 hover:text-accent-600 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Sign in
        </Button>
      </form>

      {/* Outside the form above — nesting forms is invalid HTML, and this one
          posts a different action carrying only the address. */}
      {state.needsConfirmation && state.email && <ResendPrompt email={state.email} />}
    </AuthCardShell>
  )
}

/**
 * Offered only when the address exists and was never confirmed.
 *
 * Deliberately not shown on every failed sign-in: a resend prompt that
 * appeared for any address would answer "does this person have an account
 * here" for anyone who cared to ask.
 */
function ResendPrompt({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(resendConfirmation, {
    error: null,
  })

  return (
    <form action={formAction} className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <input type="hidden" name="email" value={email} />
      <p className="text-[13px] leading-relaxed text-text-muted">
        We sent a confirmation link to <span className="font-medium text-text">{email}</span> when
        you signed up. Open it and you&rsquo;re in.
      </p>

      {state.error && (
        <p className="mt-3 text-[13px] text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.awaitingConfirmation && !state.error && (
        <p className="mt-3 text-[13px] text-success" role="status">
          Sent again — check your inbox, and spam.
        </p>
      )}

      <Button type="submit" variant="secondary" className="mt-3 w-full" loading={pending}>
        Resend the link
      </Button>
    </form>
  )
}
