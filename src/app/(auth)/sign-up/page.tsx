'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'
import { AuthCardShell } from '../_components/auth-card-shell'
import { GoogleButton } from '../_components/google-button'
import { CheckEmail } from '../_components/check-email'
import { emailPlaceholder } from '@/core/brand'

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, { error: null })

  // The account exists but is unusable until the link is opened. Showing the
  // form again here — or bouncing to /sign-in, which is what used to happen —
  // hands somebody a login that will refuse their correct password.
  if (state.awaitingConfirmation && state.email) {
    return <CheckEmail email={state.email} />
  }

  return (
    <AuthCardShell
      title="Create your account"
      subtitle="You join as a member straight away. Ask for exco access later if you need it."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-accent-600 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={signInWithGoogle}>
        <GoogleButton>Sign up with Google</GoogleButton>
      </form>

      <div className="my-6 flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
          or with email
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={formAction} className="space-y-4">
        {state.error && (
          <div
            className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
            role="alert"
          >
            {state.error}
          </div>
        )}

        <FormField label="Full name" htmlFor="name" required hint="As it should appear on club documents">
          <Input id="name" name="name" type="text" required autoComplete="name" />
        </FormField>

        <FormField label="Email" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={emailPlaceholder()}
            required
            autoComplete="email"
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required hint="At least 8 characters">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </FormField>

        <FormField label="Re-enter password" htmlFor="confirmPassword" required>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </FormField>

        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Create account
        </Button>
      </form>
    </AuthCardShell>
  )
}
