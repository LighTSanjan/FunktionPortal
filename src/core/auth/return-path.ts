/**
 * Where somebody was going when they had to sign in first.
 *
 * A shared link to a membership form is only useful if it still opens the
 * form after the code, the Microsoft round trip, or proving the address. So
 * the path rides in a short-lived cookie set by the proxy at the moment it
 * sends a signed-out visitor to sign in, "/" sends them there once they are
 * all the way in, and the proxy forgets it when they arrive.
 *
 * A cookie rather than a query parameter because the journey is not one hop:
 * the OAuth provider, the confirm-your-address step and onboarding each end
 * at "/", and threading a parameter through all of them and Supabase's
 * allow-listed redirect URLs would drop it somewhere.
 */

export const RETURN_PATH_COOKIE = 'funktion-return-to'

/**
 * Set while somebody is away connecting Google to the account they are
 * signed in to: the profile page to come back to, failed or not.
 */
export const LINKING_COOKIE = 'funktion-linking'

/** Long enough to find a code in an inbox; short enough not to surprise. */
export const RETURN_PATH_MAX_AGE_SECONDS = 30 * 60

/** Paths that are part of getting in, never somewhere to come back to. */
const NOT_A_DESTINATION = ['/sign-in', '/sign-up', '/verify-email', '/onboarding', '/auth', '/api']

const BASE = 'https://portal.invalid'

/**
 * The path and query to return to, or null when it is not a page of this
 * portal. Anything that could leave the site — `//evil.example`, `/\evil`,
 * an absolute URL — is refused, because the value came from a request.
 */
export function readReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  // A newline or a NUL would let the value break out of the header it
  // rides in. Written as escapes: the literal characters make git read
  // this file as binary, so nobody can review a change to it.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null

  let url: URL
  try {
    url = new URL(raw, BASE)
  } catch {
    return null
  }
  if (url.origin !== BASE) return null
  if (url.pathname === '/') return null
  if (NOT_A_DESTINATION.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return null

  // A client-side navigation's cache-busting marker, not part of the page.
  url.searchParams.delete('_rsc')
  return `${url.pathname}${url.search}`
}
