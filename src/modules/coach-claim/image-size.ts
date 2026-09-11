/**
 * Intrinsic pixel dimensions of an uploaded image, read from its header.
 *
 * A signature is stamped at a fixed height, so the width has to come from the
 * file. Guessing it — or fixing both — stretches somebody's handwriting, and a
 * distorted signature on a document sent to the Office of Finance is worse
 * than no signature at all: it looks like a forgery of the real one.
 */

export type ImageFormat = 'png' | 'jpg'

export interface ImageInfo {
  format: ImageFormat
  width: number
  height: number
}

export class UnreadableImageError extends Error {
  constructor(reason: string) {
    super(`That image could not be read: ${reason}`)
    this.name = 'UnreadableImageError'
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Reads PNG and JPEG only. Those are what a phone camera and a scanner
 * produce, and both are formats `docx` can embed without conversion.
 */
export function readImageInfo(bytes: Uint8Array): ImageInfo {
  if (PNG_MAGIC.every((b, i) => bytes[i] === b)) return readPng(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes)
  throw new UnreadableImageError('it is neither a PNG nor a JPEG')
}

function readPng(bytes: Uint8Array): ImageInfo {
  // The IHDR chunk is mandatory and must come first, so width and height sit
  // at a fixed offset in every valid PNG.
  if (bytes.length < 24) throw new UnreadableImageError('the PNG header is truncated')

  // The chunk type is checked, not assumed. Eight magic bytes and two
  // plausible integers are cheap to fake by accident — a truncated download
  // will manage it — and the result is a file that validates on upload and
  // then fails months later while composing a document somebody is waiting to
  // sign.
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (type !== 'IHDR') {
    throw new UnreadableImageError('the PNG has no image header where one must be')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return positive({ format: 'png', width: view.getUint32(16), height: view.getUint32(20) })
}

function readJpeg(bytes: Uint8Array): ImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2

  // JPEG is a chain of variable-length segments; the dimensions live in
  // whichever start-of-frame marker the encoder used, so the chain has to be
  // walked rather than indexed into.
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new UnreadableImageError('the JPEG segments are malformed')

    const marker = bytes[offset + 1]
    // SOF0 through SOF15, excluding the four that are not frame headers.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc, 0xd8].includes(marker)
    if (isFrame) {
      return positive({
        format: 'jpg',
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      })
    }

    const length = view.getUint16(offset + 2)
    if (length < 2) throw new UnreadableImageError('the JPEG segments are malformed')
    offset += 2 + length
  }
  throw new UnreadableImageError('the JPEG carries no frame header')
}

/**
 * A dimension of zero is not a small image, it is a broken file. Caught here
 * so that every caller — including the upload check — sees it, rather than at
 * the point of dividing by it while building a document.
 */
function positive(info: ImageInfo): ImageInfo {
  if (info.width <= 0 || info.height <= 0) {
    throw new UnreadableImageError(`it reports a size of ${info.width}x${info.height}`)
  }
  return info
}

/**
 * Scale to fill a box in whichever dimension binds, preserving aspect.
 *
 * Scales up as well as down. A signature has to sit on its rule at a
 * consistent size whatever resolution it was scanned at; the same specimen
 * rendering three millimetres tall on one document and thirty on the next
 * reads as two different signatures. Uploads enforce a floor on the source
 * resolution, so this never has much to invent.
 */
export function fitWithin(
  info: { width: number; height: number },
  box: { width: number; height: number }
): { width: number; height: number } {
  if (info.width <= 0 || info.height <= 0) {
    throw new UnreadableImageError('it reports a zero dimension')
  }
  const scale = Math.min(box.width / info.width, box.height / info.height)
  return {
    width: Math.max(1, Math.round(info.width * scale)),
    height: Math.max(1, Math.round(info.height * scale)),
  }
}
