import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveHomeDestination, destinationToPath } from '@/core/auth/routing'
import { RETURN_PATH_COOKIE, readReturnPath } from '@/core/auth/return-path'

export const dynamic = 'force-dynamic'

/**
 * "/" is the single routing brain: signed out to sign-in, signed in without an
 * organisation to the setup wizard, otherwise to their dashboard — or to the
 * page they opened before they had to sign in, once nothing is left to do
 * first. The proxy forgets that page when they reach it.
 */
export default async function Home() {
  const destination = await resolveHomeDestination()
  if (destination.kind === 'dashboard') {
    const returnTo = readReturnPath((await cookies()).get(RETURN_PATH_COOKIE)?.value)
    if (returnTo) redirect(returnTo)
  }
  redirect(destinationToPath(destination))
}
