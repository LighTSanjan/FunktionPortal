/**
 * What the portal will accept as a signature specimen.
 *
 * A signature is forgeable material that gets stamped onto documents sent to
 * the Office of Finance, so the checks here are about the document coming out
 * legible and about the file being what it claims — not about being generous
 * with formats.
 */
import { readImageInfo, UnreadableImageError, type ImageInfo } from '@/modules/coach-claim/image-size'

/** A phone photograph of a signature on paper is comfortably under this. */
export const MAX_BYTES = 2_000_000

/**
 * A specimen is scaled up to fill the signature box, so a small one is
 * stretched and turns to mush on the page. This is the floor at which the
 * result still reads as handwriting.
 */
export const MIN_WIDTH = 200

/** A signature is wide and short, but it is not one pixel tall. */
export const MIN_HEIGHT = 40

/** Past this it is a photograph of a room that happens to contain a pen. */
export const MAX_DIMENSION = 6000

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

  if (info.width < MIN_WIDTH) {
    throw new SignatureRejected(
      `That image is only ${info.width} pixels wide. It is enlarged to sit on the ` +
        `signature line, so anything under ${MIN_WIDTH} comes out blurred on the document.`
    )
  }
  if (info.height < MIN_HEIGHT) {
    throw new SignatureRejected(
      `That image is only ${info.height} pixels tall, which is not a signature.`
    )
  }
  if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) {
    throw new SignatureRejected(
      'That image is enormous. Crop it to the signature itself before uploading.'
    )
  }
  return info
}
