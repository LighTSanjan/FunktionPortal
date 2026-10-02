/**
 * Whether the sign-in that just happened proves the person holds their email.
 *
 * Everything that keys on an email address — joining the club, being linked
 * to a roster row, an invitation, the first-exco bootstrap — assumes the
 * address belongs to whoever is signed in. Supabase's own email_confirmed_at
 * cannot promise that while "Confirm email" is off: a password sign-up stamps
 * it for any address typed in. So proof is decided here, from the event in
 * front of us, and recorded on the user row by the portal alone:
 *
 * - an emailed code, verified in this request, is proof;
 * - a provider sign-in is proof when that provider vouched for the address:
 *   Google's email_verified, or for Microsoft the xms_edov claim or a sign-in
 *   from a tenant the deployment names. Microsoft's plain `email` claim is
 *   editable by whoever administers the tenant, which for a personal tenant
 *   is anybody.
 *
 * Anything else is not proof, and the person is asked for an emailed code.
 */
import type { User as SupabaseUser } from '@supabase/supabase-js'

export type ProofMethod = 'email_code' | 'google' | 'azure' | 'demo'

export interface EmailProof {
  method: ProofMethod
}

/** How recently the identity must have signed in to be the one in front of us. */
const FRESH_MS = 5 * 60 * 1000

export function proofFromEmailCode(): EmailProof {
  return { method: 'email_code' }
}

/**
 * Proof from the OAuth callback that just exchanged a code for this user.
 *
 * Which provider was used is read from the identity that signed in most
 * recently rather than from anything the browser sent: an account can carry
 * several identities, and the one that proves the address must be the one
 * that was just used, not a verified one linked some other time.
 */
export function proofFromProviderSignIn(
  user: Pick<SupabaseUser, 'email' | 'identities'>,
  now: Date = new Date()
): EmailProof | null {
  const email = user.email?.toLowerCase()
  if (!email) return null

  const latest = [...(user.identities ?? [])]
    .filter((identity) => signedInAt(identity) > 0)
    .sort((a, b) => signedInAt(b) - signedInAt(a))[0]
  if (!latest) return null
  if (now.getTime() - signedInAt(latest) > FRESH_MS) return null

  const data = (latest.identity_data ?? {}) as Record<string, unknown>
  if (String(data.email ?? '').toLowerCase() !== email) return null

  if (latest.provider === 'google') {
    return data.email_verified === true ? { method: 'google' } : null
  }
  if (latest.provider === 'azure') {
    return azureVouches(data) ? { method: 'azure' } : null
  }
  return null
}

/**
 * When this identity last signed in. Supabase sets last_sign_in_at when the
 * identity is created and never again; it is updated_at that moves, because
 * every sign-in through a provider rewrites the identity's data. Going by
 * last_sign_in_at alone, an account whose first provider sign-in did not
 * prove it could never be proven by that provider again.
 */
function signedInAt(identity: { last_sign_in_at?: string; updated_at?: string }): number {
  return Math.max(Date.parse(identity.last_sign_in_at ?? '') || 0, Date.parse(identity.updated_at ?? '') || 0)
}

function azureVouches(data: Record<string, unknown>): boolean {
  const custom = (data.custom_claims ?? {}) as Record<string, unknown>
  const claim = (name: string) => data[name] ?? custom[name]

  const edov = claim('xms_edov')
  if (edov === true || edov === 'true' || edov === 1 || edov === '1') return true

  const tenants = listEnv('MICROSOFT_TENANT_IDS')
  const tid = claim('tid')
  return typeof tid === 'string' && tenants.includes(tid.toLowerCase())
}

export function listEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}
