/** Auth queries, cached per request. */
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { createSupabaseServer } from './supabase-server'
import { dbAdmin } from '@/core/db/admin'
import { PermissionDeniedError } from '@/core/auth/errors'
import { hasPermission } from '@/core/permissions'
import type { OrgRole } from '@prisma/client'

export interface VerifiedSession {
  userId: string
  email: string
  name: string
}

export interface OrgContext {
  org: { id: string; name: string; slug: string }
  membership: { id: string; role: OrgRole; isActive: boolean }
}

/** Retry cold-pool reads three times before making the final attempt. */
export async function retryOnce<T>(
  read: () => Promise<T>,
  isEmpty: (result: T) => boolean
): Promise<T> {
  const delays = [150, 400, 1000]
  for (const delay of delays) {
    try {
      const result = await read()
      if (!isEmpty(result)) return result
    } catch {
      // fall through to the next attempt
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  return read()
}

/**
 * Verify the current session or redirect to sign-in.
 *
 * An account whose address is not proven is sent to confirm it first. Until
 * it does, it may be somebody who signed up as another person's address —
 * see core/auth/proof.ts — so it is not let near anything that address owns.
 */
export const verifySession = cache(async (): Promise<VerifiedSession> => {
  const session = await verifySessionAllowingUnproven()
  if (!session.emailProven) redirect('/verify-email')
  return { userId: session.userId, email: session.email, name: session.name }
})

/** The signed-in account, proven or not. Only the confirm-your-email screen wants this. */
export const verifySessionAllowingUnproven = cache(async (): Promise<VerifiedSession & { emailProven: boolean }> => {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  const appUser = await retryOnce(
    () =>
      dbAdmin.user.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, name: true, isActive: true, emailProvenAt: true },
      }),
    (result) => !result
  )

  if (!appUser || !appUser.isActive) {
    redirect('/sign-in')
  }

  return {
    userId: appUser.id,
    email: appUser.email,
    name: appUser.name,
    emailProven: appUser.emailProvenAt !== null,
  }
})

/** Return an active membership, hiding inaccessible organisations as 404s. */
export const getOrgContext = cache(
  async (slug: string): Promise<OrgContext> => {
    const session = await verifySession()

    const org = await retryOnce(
      () =>
        dbAdmin.organisation.findUnique({
          where: { slug },
          select: { id: true, name: true, slug: true },
        }),
      (result) => !result
    )

    if (!org) {
      notFound()
    }

    const membership = await retryOnce(
      () =>
        dbAdmin.organisationMembership.findUnique({
          where: {
            userId_orgId: { userId: session.userId, orgId: org.id },
          },
          select: { id: true, role: true, isActive: true },
        }),
      (result) => !result
    )

    if (!membership || !membership.isActive) {
      notFound()
    }

    return { org, membership }
  }
)

/** Require an active membership with the requested permission. */
export async function requirePermission(
  orgId: string,
  key: string
): Promise<{ userId: string; role: OrgRole }> {
  const session = await verifySession()

  const membership = await retryOnce(
    () =>
      dbAdmin.organisationMembership.findUnique({
        where: {
          userId_orgId: { userId: session.userId, orgId },
        },
        select: { role: true, isActive: true },
      }),
    (result) => !result
  )

  if (!membership || !membership.isActive) {
    throw new PermissionDeniedError(key)
  }

  if (!hasPermission(membership.role, key)) {
    throw new PermissionDeniedError(key)
  }

  return { userId: session.userId, role: membership.role }
}

/**
 * The same check, for a page rather than an action.
 *
 * requirePermission throws, which is right for a server action or a download
 * route — the caller gets a refusal and nothing happens. Thrown from a page,
 * it lands in the error boundary: a 500, and "a temporary issue prevented this
 * page from loading". A member who opens an exco link from the group chat is
 * not experiencing a temporary issue. They are on a screen that is not theirs,
 * and the page that says so should also say how to get access if they need it.
 */
export async function requirePagePermission(
  org: { id: string; slug: string },
  key: string
): Promise<{ userId: string; role: OrgRole }> {
  try {
    return await requirePermission(org.id, key)
  } catch (error) {
    if (error instanceof PermissionDeniedError) redirect(`/${org.slug}/no-access`)
    throw error
  }
}
