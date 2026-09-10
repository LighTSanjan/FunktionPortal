'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordReset, type AuthState } from '@/actions/auth'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'
import { AuthCardShell } from '../_components/auth-card-shell'

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {
    error: null,
  })

  // Shown whether or not the address has an account. Confirming which club
  // emails are registered is not something this form should do for anyone
  // who asks it.
  if (state.awaitingConfirmation && state.email) {
    return (
      <AuthCardShell
        title="Check your email"
        subtitle={`If ${state.email} has an account, a link to set a new password is on its way.`}
        footer={
          <Link href="/sign-in" className="font-medium text-accent-600 underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-[13px] leading-relaxed text-text-muted">
          Nothing after a minute? Check spam — it comes from Supabase, not from a FUNKtion
          address, so filters sometimes catch it. The link expires after an hour.
        </div>
      </AuthCardShell>
    )
  }

  return (
    <AuthCardShell
      title="Forgot your password?"
      subtitle="We'll email you a link to set a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/sign-in" className="font-medium text-accent-600 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div
            className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
            role="alert"
          >
            {state.error}
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

        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Send the link
        </Button>
      </form>

      <p className="mt-5 text-[12.5px] leading-relaxed text-text-subtle">
        Signed up with Google? There is no password to reset — use{' '}
        <span className="font-medium text-text-muted">Continue with Google</span> on the sign-in
        page.
      </p>
    </AuthCardShell>
  )
}
