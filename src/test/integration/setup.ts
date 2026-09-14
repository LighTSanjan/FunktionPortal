import './env'
import { vi } from 'vitest'
import { signedIn } from './actor'

/**
 * The one seam. createSupabaseServer reads the request's cookies, which do not
 * exist outside a request; everything above it — verifySession, getOrgContext,
 * requirePermission — is the real code and runs as normal.
 */
vi.mock('@/core/auth/supabase-server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: signedIn() }, error: null }),
    },
  }),
}))

// Revalidation needs Next's request store. Nothing under test depends on it.
vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}))
