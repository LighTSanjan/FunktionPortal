import { signInWithProvider } from '@/actions/auth'
import { enabledProviders } from '@/core/auth/providers'
import { AuthCardShell } from '../_components/auth-card-shell'
import { ProviderButton } from '../_components/provider-button'
import { EmailCodeForm } from '../_components/email-code-form'
import { readReturnPath } from '@/core/auth/return-path'
import { isDemo } from '@/core/auth/demo'
import { DemoSignIn } from '../_components/demo-sign-in'

export const dynamic = 'force-dynamic'

const REDIRECT_ERRORS: Record<string, string> = {
  link_expired: 'That link has expired or was already used. Ask for a code below instead.',
  invalid_link: 'That link is not valid. Ask for a code below instead.',
  exchange_failed: 'That sign-in did not complete. Try again.',
  missing_code: 'That sign-in did not complete. Try again.',
  google_unavailable: 'Google sign-in is not available right now. Use an emailed code.',
  azure_unavailable: 'Microsoft sign-in is not available right now. Use an emailed code.',
  access_denied: 'Sign-in was cancelled.',
  demo_busy: 'Lots of demo sign-ins from here in the last hour. Try again a bit later.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const { error: code, callbackUrl } = await searchParams
  const returning = readReturnPath(callbackUrl) !== null
  const error = code ? (REDIRECT_ERRORS[code] ?? 'Something went wrong signing you in.') : null
  const providers = await enabledProviders()

  if (isDemo()) {
    return (
      <AuthCardShell
        title="FUNKtion portal demo"
        subtitle="A made-up club to click around in. Nothing here is real, nothing is emailed, and it gets reset now and then. Pick who to be."
      >
        {error && (
          <div className="mb-5 rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger" role="alert">
            {error}
          </div>
        )}
        <DemoSignIn />
      </AuthCardShell>
    )
  }

  return (
    <AuthCardShell
      title="Welcome!"
      subtitle="For FUNKtion members, new and returning. Use Google, or a code sent to your SUTD or personal email. Personal email is the surer one: SUTD’s filter often holds the code back."
    >
      {returning && !error && (
        <p className="mb-5 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-text-muted">
          Sign in and you&rsquo;ll go straight back to the page you opened.
        </p>
      )}

      {error && (
        <div className="mb-5 rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger" role="alert">
          {error}
        </div>
      )}

      {(providers.azure || providers.google) && (
        <>
          <div className="space-y-3">
            {providers.azure && (
              <form action={signInWithProvider}>
                <input type="hidden" name="provider" value="azure" />
                <ProviderButton provider="azure">Continue with SUTD Microsoft</ProviderButton>
              </form>
            )}
            {providers.google && (
              <form action={signInWithProvider}>
                <input type="hidden" name="provider" value="google" />
                <ProviderButton provider="google">Continue with Google</ProviderButton>
              </form>
            )}
          </div>

          <div className="my-6 flex items-center gap-4" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
              or with an emailed code
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <EmailCodeForm localMailbox={process.env.LOCAL_MAILBOX_URL || undefined} />
    </AuthCardShell>
  )
}
