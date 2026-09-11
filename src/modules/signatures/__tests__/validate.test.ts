/** What the portal will accept as a signature specimen. */
import { describe, it, expect } from 'vitest'
import { validateSignature, SignatureRejected, MAX_BYTES } from '../validate'

function png(width: number, height: number, type = 'IHDR'): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  for (let i = 0; i < 4; i++) bytes[12 + i] = type.charCodeAt(i)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('validateSignature', () => {
  // The six specimens the club actually uploaded. The first rule written here
  // asked for 200 pixels of width and refused the 160×162 one outright, which
  // is how a plausible-sounding threshold gets caught by real data.
  it.each([
    ['a compact, near-square signature', 160, 162],
    ['a small scanned one', 226, 142],
    ['a phone photograph', 532, 240],
    ['a wide digital capture', 516, 284],
    ['a drawn one', 466, 266],
    ['a stylus capture', 410, 198],
  ])('accepts %s (%i×%i)', (_what, width, height) => {
    expect(() => validateSignature(png(width, height))).not.toThrow()
  })

  it('accepts a photograph of a signature', () => {
    expect(validateSignature(png(900, 260))).toEqual({ format: 'png', width: 900, height: 260 })
  })

  it('rejects a file that is not an image, whatever it is called', () => {
    // The content type a browser sends is taken from the file extension. It
    // is a claim, and this is the fact.
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0])
    expect(() => validateSignature(pdf)).toThrow(SignatureRejected)
  })

  it('rejects a file with PNG magic bytes and no image behind them', () => {
    // A truncated download produces exactly this, and it would otherwise pass
    // here and fail months later while composing a document.
    expect(() => validateSignature(png(900, 260, 'IDAT'))).toThrow(SignatureRejected)
  })

  it('rejects a specimen too small to read once it is on the line', () => {
    // Small in both dimensions: the box has to enlarge it, and it arrives
    // on the page as mush.
    expect(() => validateSignature(png(140, 40))).toThrow(SignatureRejected)
    // Plenty of pixels per inch, not a signature.
    expect(() => validateSignature(png(900, 3))).toThrow(SignatureRejected)
  })

  it('rejects a zero dimension rather than dividing by it later', () => {
    expect(() => validateSignature(png(900, 0))).toThrow(SignatureRejected)
  })

  it('rejects an empty file and one over the size limit', () => {
    expect(() => validateSignature(new Uint8Array(0))).toThrow(SignatureRejected)
    const huge = new Uint8Array(MAX_BYTES + 1)
    huge.set(png(900, 260), 0)
    expect(() => validateSignature(huge)).toThrow(SignatureRejected)
  })
})
