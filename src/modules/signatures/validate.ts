/**
 * What the portal will accept as a signature specimen.
 *
 * A signature is forgeable material that gets stamped onto documents sent to
 * the Office of Finance, so the checks here are about the document coming out
 * legible and about the file being what it claims — not about being generous
 * with formats.
 */
import {
  readImageInfo,
  fitWithin,
  UnreadableImageError,
  type ImageInfo,
} from '@/modules/coach-claim/image-size'
import { SIGNATURE_BOX } from '@/modules/coach-claim/signature-block'

/** A phone photograph of a signature on paper is comfortably under this. */
export const MAX_BYTES = 2_000_000

/**
 * The floor on how much detail survives being placed on the page.
 *
 * The first version of this asked for 200 pixels of width, on the assumption
 * that a signature is wide and short. Real specimens say otherwise: a compact
 * signature that is 160 wide and 162 tall was refused by that rule, and it
 * would have printed beautifully — the box is far shorter than it is wide, so
 * a tall image is scaled DOWN by its height and arrives with detail to spare.
 *
 * What actually matters is the resolution left after the image has been
 * fitted to the box, which is a fact about both dimensions together and about
 * the box, not about width alone. 150 dpi is the point at which a stamped
 * signature stops looking scanned and starts looking pixelated in print.
 */
export const MIN_EFFECTIVE_DPI = 150

/** The box is measured in pixels at 96dpi, so that is what the fit is in. */
const BOX_DPI = 96

/** Past this it is a photograph of a room that happens to contain a pen. */
export const MAX_DIMENSION = 6000

/**
 * Bounds on the shape of the thing.
 *
 * Resolution alone cannot tell a signature from a 900×3 hairline: scaled to
 * the box, that line has plenty of pixels per inch and none of them are
 * handwriting. The six real specimens on file run from 0.99 to 2.2 wide-to-
 * tall, so these are loose enough to be about absurdity rather than taste.
 */
const MAX_ASPECT = 12
const MIN_ASPECT = 1 / 6

export class SignatureRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureRejected'
  }
}

/**
 * The image's own header decides the format, not the browser's content type —
 * which is taken from the file extension and is a claim, not a fact.
 */
export function validateSignature(bytes: Uint8Array): ImageInfo {
  if (bytes.byteLength === 0) {
    throw new SignatureRejected('That file is empty.')
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new SignatureRejected(
      `That image is ${(bytes.byteLength / 1_000_000).toFixed(1)} MB. The limit is ` +
        `${MAX_BYTES / 1_000_000} MB — a photograph of a signature is usually well under it.`
    )
  }

  let info: ImageInfo
  try {
    info = readImageInfo(bytes)
  } catch (error) {
    if (error instanceof UnreadableImageError) {
      throw new SignatureRejected(
        'That has to be a PNG or a JPEG. A PDF or a HEIC will not embed in the documents.'
      )
    }
    throw error
  }

  const dpi = effectiveDpi(info)
  if (dpi < MIN_EFFECTIVE_DPI) {
    throw new SignatureRejected(
      `That image is ${info.width}×${info.height}, which works out at about ${Math.round(dpi)} dpi ` +
        `once it is fitted to the signature line — it would print visibly pixelated. Scan or ` +
        `photograph it larger; anything from a phone camera is comfortably enough.`
    )
  }
  const aspect = info.width / info.height
  if (aspect > MAX_ASPECT || aspect < MIN_ASPECT) {
    throw new SignatureRejected(
      `That image is ${info.width}×${info.height}. Nothing that shape is a signature — crop it ` +
        'to the writing itself.'
    )
  }
  if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) {
    throw new SignatureRejected(
      'That image is enormous. Crop it to the signature itself before uploading.'
    )
  }
  return info
}

/**
 * The resolution the specimen ends up at on the page.
 *
 * fitWithin scales by whichever dimension binds first, so the ratio it
 * returns is what the printed image is actually rendered at. Dividing the
 * box's own dpi by that scale gives the density of the result.
 */
export function effectiveDpi(info: ImageInfo): number {
  const fitted = fitWithin(info, SIGNATURE_BOX)
  const scale = fitted.width / info.width
  return BOX_DPI / scale
}
