import { redirect } from 'next/navigation'
import { verifySessionAllowingUnproven } from '@/core/auth/dal'
import { Button } from '@/core/ui/button'
import { AuthCardShell } from '../_components/auth-card-shell'
import { EmailCodeForm } from '../_components/email-code-form'

export const dynamic = 'force-dynamic'

/**
 * Signed in, but the address on the account is not proven yet.
 *
 * Reached by accounts made before sign-in codes existed, and by provider
 * sign-ins where the provider did not vouch for the address. One code and
 * they are through; until then they see nothing the address owns.
 */
export default async function VerifyEmailPage() {
  const session = await verifySessionAllowingUnproven()
  if (session.emailProven) redirect('/')

  return (
    <AuthCardShell
      title="One more step"
      subtitle="Confirm this is your email address. It keeps anybody else from signing in as you."
    >
      <EmailCodeForm fixedEmail={session.email} />

      <form action="/api/auth/sign-out" method="post" className="mt-6">
        <Button type="submit" variant="ghost" className="w-full">
          Not you? Sign out
        </Button>
      </form>
    </AuthCardShell>
  )
}
