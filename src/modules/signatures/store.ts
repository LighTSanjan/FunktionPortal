/**
 * Where a signature specimen lives.
 *
 * Keys are derived from the signatory's id and never accepted from a caller,
 * so there is no call shape that reads somebody else's specimen. The bucket is
 * private and every object in it is reached server-side.
 */
import 'server-only'
import { randomUUID } from 'crypto'
import { immutableCache } from '@/lib/immutable-cache'
import { getStorageUnscoped } from '@/core/storage'
import type { ImageFormat } from '@/modules/coach-claim/image-size'
import type { SignatureImage } from '@/modules/coach-claim/types'

const PREFIX = 'signatures'

const CONTENT_TYPE: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
}

/**
 * A fresh key on every upload rather than one key per user.
 *
 * Overwriting in place leaves a replaced signature reachable from any cached
 * copy of the old URL, and makes "which specimen was on the document I sent in
 * June" unanswerable.
 */
function newKey(userId: string, format: ImageFormat): string {
  return `${PREFIX}/${userId}/${randomUUID()}.${format}`
}

export async function putSignature(
  userId: string,
  bytes: Uint8Array,
  format: ImageFormat
): Promise<string> {
  const key = newKey(userId, format)
  await getStorageUnscoped().upload(key, bytes, CONTENT_TYPE[format])
  return key
}

/**
 * The specimen, ready to stamp.
 *
 * Null rather than throwing when it is missing: a signature that has been
 * removed, or a storage object that has gone, must not stop the month's
 * documents being produced — they simply print with an empty rule to sign by
 * hand, which is what the club did before this existed.
 */
/** Keys are never reused (see newKey), so a cached specimen is never stale. */
const specimens = immutableCache<SignatureImage>(50)

export async function readSignature(key: string | null): Promise<SignatureImage | null> {
  if (!key) return null
  const format: ImageFormat = key.endsWith('.jpg') ? 'jpg' : 'png'
  return specimens.get(key, async () => {
    try {
      return { data: await getStorageUnscoped().download(key), format }
    } catch {
      return null
    }
  })
}

/** A short-lived URL, for showing somebody their own specimen back. */
export async function signaturePreviewUrl(key: string | null): Promise<string | null> {
  if (!key) return null
  try {
    return await getStorageUnscoped().getSignedUrl(key, 120)
  } catch {
    return null
  }
}
