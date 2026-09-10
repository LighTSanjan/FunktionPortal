'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { setNewPassword, type AuthState } from '@/actions/auth'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'
import { AuthCardShell } from '../_components/auth-card-shell'

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(setNewPassword, {
    error: null,
  })

  return (
    <AuthCardShell
      title="Set a new password"
      subtitle="Then you'll be signed in."
      footer={
        <Link href="/sign-in" className="font-medium text-accent-600 underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div
            className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
            role="alert"
          >
            {state.error}{' '}
            <Link href="/forgot-password" className="font-medium underline underline-offset-4">
              Ask for a new link
            </Link>
            .
          </div>
        )}

        <FormField label="New password" htmlFor="password" required hint="At least 8 characters">
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
          Set password
        </Button>
      </form>
    </AuthCardShell>
  )
}
