/**
 * A small in-memory cache for things stored under a key that is never reused.
 *
 * Signature specimens, logos and printed PDFs are each written to a fresh key
 * every time, so a key always names the same bytes and a cached copy can never
 * be stale. Rendering a month's page downloaded both images from storage on
 * every visit, which was most of the time the page took. Bounded, so a long-
 * running server does not grow without limit; per instance, so nothing leaves
 * the server that asked for it.
 */
export function immutableCache<T>(maxEntries: number) {
  const entries = new Map<string, T>()
  return {
    async get(key: string, load: () => Promise<T | null>): Promise<T | null> {
      const hit = entries.get(key)
      if (hit !== undefined) {
        // Refresh its place, so the oldest-used goes first.
        entries.delete(key)
        entries.set(key, hit)
        return hit
      }
      const value = await load()
      if (value !== null) {
        entries.set(key, value)
        if (entries.size > maxEntries) entries.delete(entries.keys().next().value!)
      }
      return value
    },
  }
}
