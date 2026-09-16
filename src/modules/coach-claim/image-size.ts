import { imageDimensionsFromData } from 'image-dimensions'

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

export function readImageInfo(bytes: Uint8Array): ImageInfo {
  const isPng = bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  if (isPng && (bytes.length < 16 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR')) {
    throw new UnreadableImageError('the PNG has no image header where one must be')
  }

  const dimensions = imageDimensionsFromData(bytes)
  if (!dimensions || !['png', 'jpeg'].includes(dimensions.type)) {
    throw new UnreadableImageError('it is neither a PNG nor a JPEG')
  }
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new UnreadableImageError(`it reports a size of ${dimensions.width}x${dimensions.height}`)
  }
  return {
    format: dimensions.type === 'jpeg' ? 'jpg' : 'png',
    width: dimensions.width,
    height: dimensions.height,
  }
}

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
