import 'server-only'

import { cache } from 'react'
import { createSupabaseServer } from './supabase-server'
import { dbAdmin } from '@/core/db/admin'
import { retryOnce } from './dal'

/** Resolve the first route before an organisation context exists. */
export type HomeDestination =
  | { kind: 'sign-in' }
  | { kind: 'onboarding' }
  | { kind: 'dashboard'; orgSlug: string }

export const resolveHomeDestination = cache(
  async (): Promise<HomeDestination> => {
    const supabase = await createSupabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { kind: 'sign-in' }

    const membership = await retryOnce(
      () =>
        dbAdmin.organisationMembership.findFirst({
          where: { userId: user.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { organisation: { select: { slug: true } } },
        }),
      (result) => !result
    )

    if (!membership) return { kind: 'onboarding' }

    return { kind: 'dashboard', orgSlug: membership.organisation.slug }
  }
)

export function destinationToPath(dest: HomeDestination): string {
  switch (dest.kind) {
    case 'sign-in':
      return '/sign-in'
    case 'onboarding':
      return '/onboarding'
    case 'dashboard':
      return `/${dest.orgSlug}/dashboard`
  }
}
