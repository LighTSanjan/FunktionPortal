/**
 * The PayNow QR for one collection.
 *
 * A new QR is generated for each collection, so it is stored against the term
 * rather than the club. Held once on the organisation, the second term would
 * show members the first term's code and their money would land somewhere
 * nobody is reconciling against this roster.
 *
 * Keys are derived from the term, never accepted from a caller.
 */
import 'server-only'
import { randomUUID } from 'crypto'
import { getStorageUnscoped } from '@/core/storage'
import {
  readImageInfo,
  UnreadableImageError,
  type ImageFormat,
} from '@/modules/coach-claim/image-size'

const PREFIX = 'paynow-qr'

/** A screenshot of a QR is well under this; a photograph of a screen is not. */
export const MAX_QR_BYTES = 5_000_000

/**
 * Below this a QR will not survive being displayed and re-scanned from
 * another phone. Banking apps generate them far larger.
 */
const MIN_SIDE = 180

const CONTENT_TYPE: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
}

export class QrRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QrRejected'
  }
}

/**
 * The file's own header decides the format and the size, not the browser's
 * content type, which is taken from the extension and is a claim rather than
 * a fact.
 *
 * A QR that will not scan is worse than no QR: the member cannot pay and has
 * no way of knowing whether the fault is theirs, so it is refused here rather
 * than displayed and puzzled over.
 */
export function validateQr(bytes: Uint8Array): ImageFormat {
  if (bytes.byteLength === 0) throw new QrRejected('That file is empty.')
  if (bytes.byteLength > MAX_QR_BYTES) {
    throw new QrRejected(
      `That image is over ${MAX_QR_BYTES / 1_000_000} MB. A screenshot of the QR is usually far under it.`
    )
  }

  let info
  try {
    info = readImageInfo(bytes)
  } catch (error) {
    if (error instanceof UnreadableImageError) {
      throw new QrRejected('That has to be an image of the QR — a PNG or a JPEG, not a PDF.')
    }
    throw error
  }

  if (info.width < MIN_SIDE || info.height < MIN_SIDE) {
    throw new QrRejected(
      `That image is ${info.width}×${info.height}. Below ${MIN_SIDE}×${MIN_SIDE} a QR stops scanning reliably off a screen — save the QR from your banking app rather than cropping a screenshot.`
    )
  }

  return info.format
}

export async function putQr(
  termId: string,
  bytes: Uint8Array,
  format: ImageFormat
): Promise<string> {
  // A fresh key every time. Overwriting in place would leave the replaced QR
  // reachable from a cached URL, which is the one failure mode worth spending
  // a few kilobytes to avoid: a member paying against a superseded code.
  const key = `${PREFIX}/${termId}/${randomUUID()}.${format}`
  await getStorageUnscoped().upload(key, bytes, CONTENT_TYPE[format])
  return key
}

/**
 * The QR bytes, read server-side.
 *
 * Not a signed URL. Every member has to see this, and a signed URL that
 * expires in a minute is a QR that has vanished by the time somebody has
 * opened their banking app — while a long-lived one is a public address for
 * the club's collection code that outlives the collection.
 */
export async function readQr(
  key: string | null
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!key) return null
  const format: ImageFormat = key.endsWith('.jpg') ? 'jpg' : 'png'
  try {
    return { bytes: await getStorageUnscoped().download(key), contentType: CONTENT_TYPE[format] }
  } catch {
    return null
  }
}
