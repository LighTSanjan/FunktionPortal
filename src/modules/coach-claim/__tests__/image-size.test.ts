/** Reading an uploaded signature's dimensions out of its header. */
import { describe, it, expect } from 'vitest'
import { readImageInfo, fitWithin, UnreadableImageError } from '../image-size'

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13) // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

/** SOI, then one skipped segment, then an SOF0 carrying the dimensions. */
function jpeg(width: number, height: number): Uint8Array {
  const skipped = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46]
  const frame = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff]
  return new Uint8Array([0xff, 0xd8, ...skipped, ...frame, 0, 0, 0, 0, 0, 0, 0, 0, 0])
}

describe('readImageInfo', () => {
  it('reads a PNG', () => {
    expect(readImageInfo(png(600, 180))).toEqual({ format: 'png', width: 600, height: 180 })
  })

  it('reads a JPEG, walking past segments that are not frame headers', () => {
    expect(readImageInfo(jpeg(800, 240))).toEqual({ format: 'jpg', width: 800, height: 240 })
  })

  it('refuses anything else rather than guessing', () => {
    // A PDF scan is the likely mistake, and it would embed as a broken image
    // on a document going to the Office of Finance.
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    expect(() => readImageInfo(pdf)).toThrow(UnreadableImageError)
  })

  it('refuses a truncated PNG rather than reading past the end', () => {
    expect(() => readImageInfo(png(600, 180).slice(0, 20))).toThrow(UnreadableImageError)
  })

  it('checks the image header is really there, not just the magic bytes', () => {
    // Eight magic bytes and two plausible integers are easy to produce by
    // accident — a truncated download manages it — and the result would
    // validate on upload and then fail months later while composing a
    // document somebody is waiting to sign.
    const fake = png(600, 180)
    fake.set([0x49, 0x44, 0x41, 0x54], 12) // "IDAT" where IHDR must be
    expect(() => readImageInfo(fake)).toThrow(UnreadableImageError)
  })

  it('refuses a zero dimension at the point of reading it', () => {
    expect(() => readImageInfo(png(200, 0))).toThrow(UnreadableImageError)
    expect(() => readImageInfo(jpeg(0, 200))).toThrow(UnreadableImageError)
  })
})

describe('fitWithin', () => {
  const box = { width: 150, height: 46 }

  it('binds on whichever dimension runs out first', () => {
    // Wide and short: the width binds.
    expect(fitWithin({ width: 600, height: 120 }, box)).toEqual({ width: 150, height: 30 })
    // Tall and narrow: the height binds.
    expect(fitWithin({ width: 200, height: 200 }, box)).toEqual({ width: 46, height: 46 })
  })

  it('scales a small specimen up, so one signature is one size', () => {
    expect(fitWithin({ width: 75, height: 23 }, box)).toEqual({ width: 150, height: 46 })
  })

  it('never distorts', () => {
    const source = { width: 640, height: 200 }
    const fitted = fitWithin(source, box)
    expect(fitted.width / fitted.height).toBeCloseTo(source.width / source.height, 1)
  })

  it('refuses a zero dimension rather than dividing by it', () => {
    expect(() => fitWithin({ width: 0, height: 10 }, box)).toThrow(UnreadableImageError)
  })
})
