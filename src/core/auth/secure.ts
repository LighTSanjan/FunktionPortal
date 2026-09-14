import 'server-only'

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shut out whoever held this account before its address was proven.
 *
 * While Supabase's "Confirm email" is off, anybody can sign up with a
 * password as somebody else's address. When the real owner later signs in —
 * by emailed code, Google or Microsoft — Supabase hands them that same
 * account, and without this the impostor's password and sessions would still
 * work alongside theirs.
 *
 * The portal offers no password sign-in, so no password on an account is one
 * its owner uses: it is replaced with one nobody has seen. Every other session
 * is then ended. Both run on the caller's own session, which survives.
 */
export async function secureProvenAccount(supabase: SupabaseClient): Promise<void> {
  const { error: passwordError } = await supabase.auth.updateUser({
    password: randomBytes(48).toString('base64url'),
  })
  if (passwordError) throw new Error(`Could not reset the account password: ${passwordError.message}`)

  const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
  if (signOutError) throw new Error(`Could not end the account's other sessions: ${signOutError.message}`)
}
