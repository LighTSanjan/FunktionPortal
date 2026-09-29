import { redirect } from 'next/navigation'
import { verifySession } from '@/core/auth/dal'
import { resolveHomeDestination, destinationToPath } from '@/core/auth/routing'
import { Button } from '@/core/ui/button'
import { AuthCardShell } from '../_components/auth-card-shell'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const session = await verifySession()

  // Guard against a stale tab: someone added while sitting here should not
  // have to work out that they need to reload.
  const destination = await resolveHomeDestination()
  if (destination.kind === 'dashboard') {
    redirect(destinationToPath(destination))
  }

  return (
    <AuthCardShell
      title="You're not on the list yet"
      subtitle="The portal lets in SUTD student and alumni addresses and Gmail by itself. Anyone else — instructors, other email providers — needs an invitation from the exco."
    >
      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Signed in as
        </p>
        <p className="mt-1.5 font-medium text-text">{session.name}</p>
        <p className="text-[13.5px] text-text-muted">{session.email}</p>
      </div>

      <p className="mt-5 text-[13.5px] leading-relaxed text-text-muted">
        Send that address to the treasurer or the secretary and ask them to invite it, then sign
        in again. Or sign out and use your SUTD address or a Gmail account instead.
      </p>

      <form action="/api/auth/sign-out" method="post" className="mt-6">
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </AuthCardShell>
  )
}
