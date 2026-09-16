import { unstable_isUnrecognizedActionError } from 'next/navigation'

/**
 * Telling "this tab can no longer load what it needs" apart from a real crash.
 *
 * Every deploy — and every restart of the dev server — gives the server
 * actions new identifiers and the page new script chunks. A tab left open
 * across one is still holding the old ones, so the next button press posts an
 * action the server has never heard of, and the next lazy import asks for a
 * file that is no longer served. Next throws, and its wording reads to the
 * person looking at it as though the portal had fallen over.
 *
 * It has not: the page only needs loading again. Saying so, and offering a
 * reload rather than a "Try again" that would post the same dead action, is
 * the difference between a portal that looks broken and one that looks
 * looked-after.
 *
 * Deliberately narrow — matching on what an error *says* would eventually
 * catch one of the portal's own messages and answer a real fault with "just
 * reload". So: Next's own predicate for an action id this build does not
 * have, its own class names, and the two fixed sentences a browser uses when
 * a script file will not load. Everything else goes to the crash page, which
 * says somebody should be told.
 *
 * The router's "An unexpected response was received from the server." is not
 * here either: it covers any reply that is not a server response, a genuine
 * 500 among them. The one that used to reach members — the proxy turning a
 * button press away as HTML — is answered properly in src/proxy.ts now.
 */

/** Next's class names: an action id not in this build, and a missing chunk. */
const NAMES = ['UnrecognizedActionError', 'ChunkLoadError']

/** What a browser says when a script file the page was built against is gone. */
const CHUNK_MESSAGE =
  /^(loading chunk \S+ failed|(error loading|failed to fetch) dynamically imported module)/i

export function isStaleClientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  try {
    // Next's own check, which is an instanceof and cannot be fooled.
    if (unstable_isUnrecognizedActionError(error)) return true
  } catch {
    // Only callable on the client. Every error boundary here is a client
    // component, so this is belt and braces; the names below still hold.
  }

  const { name, message } = error as { name?: unknown; message?: unknown }
  if (typeof name === 'string' && NAMES.includes(name)) return true
  return typeof message === 'string' && CHUNK_MESSAGE.test(message)
}
