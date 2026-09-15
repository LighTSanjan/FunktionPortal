/**
 * The organisation's logo: stored privately, stamped on its documents.
 *
 * A fresh key on every upload, never overwritten, for the same reason as
 * signatures: a month raised in August records the key of the logo it was
 * raised under, so replacing the logo in December does not quietly change the
 * August documents already with the Office of Finance.
 */
import 'server-only'
import { randomUUID } from 'crypto'
import { immutableCache } from '@/lib/immutable-cache'
import { getStorageUnscoped } from '@/core/storage'
import { readImageInfo, UnreadableImageError, type ImageFormat } from '@/modules/coach-claim/image-size'
import type { BrandLogo } from '@/modules/coach-claim/types'

const CONTENT_TYPE: Record<ImageFormat, string> = { png: 'image/png', jpg: 'image/jpeg' }

export const MAX_LOGO_BYTES = 2_000_000
/** Below this a logo prints as a smudge at letterhead size. */
const MIN_LOGO_EDGE = 120
const MAX_LOGO_EDGE = 6000

export class LogoRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LogoRejected'
  }
}

/** The image's own header decides what it is, not the file name. */
export function validateLogo(bytes: Uint8Array): { format: ImageFormat; width: number; height: number } {
  if (bytes.byteLength === 0) throw new LogoRejected('That file is empty.')
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    throw new LogoRejected(`That image is over ${MAX_LOGO_BYTES / 1_000_000} MB.`)
  }
  let info
  try {
    info = readImageInfo(bytes)
  } catch (error) {
    if (error instanceof UnreadableImageError) throw new LogoRejected('That has to be a PNG or a JPEG.')
    throw error
  }
  if (Math.max(info.width, info.height) < MIN_LOGO_EDGE) {
    throw new LogoRejected(`That logo is ${info.width}×${info.height}. Use one at least ${MIN_LOGO_EDGE} pixels across, or it prints blurry.`)
  }
  if (Math.max(info.width, info.height) > MAX_LOGO_EDGE) {
    throw new LogoRejected('That image is enormous. Export the logo under 6000 pixels across.')
  }
  return info
}

export async function putLogo(orgId: string, bytes: Uint8Array, format: ImageFormat): Promise<string> {
  const key = `branding/${orgId}/${randomUUID()}.${format}`
  await getStorageUnscoped().upload(key, bytes, CONTENT_TYPE[format])
  return key
}

/**
 * The logo, ready to place. Null rather than throwing when it is missing:
 * a document without its logo still has to be producible, and prints the
 * club's name in its place.
 */
/** Every upload gets a fresh key, so a cached logo is never stale. */
const logos = immutableCache<BrandLogo>(20)

export async function readLogo(key: string | null | undefined): Promise<BrandLogo | null> {
  if (!key) return null
  return logos.get(key, async () => {
    try {
      const bytes = await getStorageUnscoped().download(key)
      const info = readImageInfo(bytes)
      return { bytes, ...info }
    } catch (error) {
      console.error('[branding] logo could not be read', error instanceof Error ? error.message : error)
      return null
    }
  })
}

/** For putting the logo on a page without handing out a storage URL. */
export function logoDataUri(logo: BrandLogo): string {
  return `data:${CONTENT_TYPE[logo.format]};base64,${Buffer.from(logo.bytes).toString('base64')}`
}
