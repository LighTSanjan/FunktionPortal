import 'server-only'

import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js'
import { logAuthEvent } from '@/core/audit/auth-events'
import { alert } from '@/core/alerts'
import { dbAdmin } from '@/core/db/admin'
import { normaliseEmail } from './eligibility'
import type { EmailProof } from './proof'
import { provisionUser } from './provision'
import { secureProvenAccount } from './secure'

/** Everything that follows a successful sign-in, whichever way it came. */
export async function afterSignIn(
  supabase: SupabaseClient,
  user: SupabaseUser,
  proof: EmailProof | null
): Promise<void> {
  // The impostor goes first. Recording the proof is what lets an account
  // near member data, so the password and sessions somebody else may hold
  // are ended before it is written — and if ending them fails, nothing is.
  if (proof && !(await alreadyProven(user))) {
    await secureProvenAccount(supabase)
  }

  const result = await provisionUser(user, proof)

  if (result.newlyProven) {
    const joined = await dbAdmin.organisationMembership.findFirst({
      where: { userId: user.id, isActive: true },
      select: { id: true },
    })
    await alert(joined ? 'account_proven' : 'join_refused', {
      email: user.email,
      via: proof?.method,
    })
  }

  await logAuthEvent(user.id, 'auth.sign_in')
}

async function alreadyProven(user: SupabaseUser): Promise<boolean> {
  const row = await dbAdmin.user.findUnique({
    where: { id: user.id },
    select: { email: true, emailProvenAt: true },
  })
  return Boolean(row?.emailProvenAt) && normaliseEmail(row!.email) === normaliseEmail(user.email ?? '')
}
