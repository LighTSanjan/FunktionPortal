/**
 * The photo somebody chose for themselves.
 *
 * Kept in the private bucket under a fresh key each time, like a signature,
 * and streamed back through /api/photo rather than linked to: the bucket has
 * no public surface, and the key never reaches a page.
 */
import 'server-only'
import { randomUUID } from 'crypto'
import { immutableCache } from '@/lib/immutable-cache'
import { getStorageUnscoped } from '@/core/storage'
import { readImageInfo, UnreadableImageError, type ImageFormat } from '@/modules/coach-claim/image-size'

const PREFIX = 'photos'

/** The browser shrinks it to a small square first; this is room to spare. */
export const MAX_PHOTO_BYTES = 1_500_000

export const PHOTO_CONTENT_TYPE: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
}

/** The format, or a sentence saying what is wrong with the file. */
export function checkPhoto(bytes: Uint8Array): ImageFormat | string {
  if (bytes.byteLength === 0) return 'That file is empty.'
  if (bytes.byteLength > MAX_PHOTO_BYTES) return 'That photo is too big. Try a smaller one.'
  try {
    const info = readImageInfo(bytes)
    if (info.width > 6000 || info.height > 6000) return 'That photo is too big. Try a smaller one.'
    return info.format
  } catch (error) {
    if (error instanceof UnreadableImageError) return 'Use a JPEG or PNG photo.'
    throw error
  }
}

export async function putPhoto(userId: string, bytes: Uint8Array, format: ImageFormat): Promise<string> {
  const key = `${PREFIX}/${userId}/${randomUUID()}.${format}`
  await getStorageUnscoped().upload(key, bytes, PHOTO_CONTENT_TYPE[format])
  return key
}

/** Keys are never reused, so a cached photo is never stale. */
const photos = immutableCache<Buffer>(100)

export async function readPhoto(key: string): Promise<Buffer | null> {
  return photos.get(key, async () => {
    try {
      return await getStorageUnscoped().download(key)
    } catch {
      return null
    }
  })
}

/** Best effort: a photo left behind in private storage harms nobody. */
export async function discardPhoto(key: string | null): Promise<void> {
  if (!key) return
  try {
    await getStorageUnscoped().delete(key)
  } catch {}
}

/** The address a page shows it at; changes whenever the photo does. */
export function photoUrl(key: string | null): string | null {
  if (!key) return null
  const version = key.slice(key.lastIndexOf('/') + 1, key.lastIndexOf('.'))
  return `/api/photo?v=${version}`
}
