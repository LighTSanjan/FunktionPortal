/**
 * Who the integration tests are currently signed in as.
 *
 * Scoped to the async context, not a module-level variable. With a plain
 * variable, two requests started together both read whoever was set last by
 * the time they got round to asking — so a test of two people signing the
 * same month at once was really one person signing twice, and could not have
 * caught the bug it was named after.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { User as SupabaseUser } from '@supabase/supabase-js'

const scoped = new AsyncLocalStorage<SupabaseUser | null>()
let fallback: SupabaseUser | null = null

function toSupabaseUser(user: { id: string; email: string } | null): SupabaseUser | null {
  return user
    ? ({
        id: user.id,
        email: user.email,
        app_metadata: { provider: 'email' },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as SupabaseUser)
    : null
}

/** Sign in for the rest of the test. */
export function signInAs(user: { id: string; email: string } | null): void {
  fallback = toSupabaseUser(user)
}

/** Run one piece of work as somebody, without changing who everything else runs as. */
export function runAs<T>(user: { id: string; email: string } | null, work: () => Promise<T>): Promise<T> {
  return scoped.run(toSupabaseUser(user), work)
}

export function signedIn(): SupabaseUser | null {
  const store = scoped.getStore()
  return store === undefined ? fallback : store
}
