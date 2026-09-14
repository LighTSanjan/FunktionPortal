import 'server-only'

import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js'
import { logAuthEvent } from '@/core/audit/auth-events'
import { alert } from '@/core/alerts'
import { dbAdmin } from '@/core/db/admin'
import type { EmailProof } from './proof'
import { provisionUser } from './provision'
import { secureProvenAccount } from './secure'

/** Everything that follows a successful sign-in, whichever way it came. */
export async function afterSignIn(
  supabase: SupabaseClient,
  user: SupabaseUser,
  proof: EmailProof | null
): Promise<void> {
  const result = await provisionUser(user, proof)

  if (result.newlyProven) {
    await secureProvenAccount(supabase)

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
