import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Supabase with the secret key, for the few things only an admin may do. */
export function supabaseAdmin(): SupabaseClient {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not configured.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
