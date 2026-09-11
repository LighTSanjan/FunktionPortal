import { describe, expect, it } from 'vitest'
import { readBackground, liftInk } from '../clean'

/** An image of flat `paper`, with a horizontal bar of `ink` across the middle. */
function specimen(
  width: number,
  height: number,
  paper: [number, number, number],
  ink: [number, number, number],
  alpha = 255
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const onInk = y > height * 0.4 && y < height * 0.6 && x > 2 && x < width - 3
      const [r, g, b] = onInk ? ink : paper
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = alpha
    }
  }
  return data
}

describe('reading the background', () => {
  it('leaves a clean digital capture alone', () => {
    const reading = readBackground(specimen(60, 40, [255, 255, 255], [10, 10, 10]), 60, 40)
    expect(reading.photographed).toBe(false)
    expect(reading.paper).toBeCloseTo(255)
  })

  it('spots a photograph of paper', () => {
    // Cream, which is what the one photographed specimen on file measures at.
    const reading = readBackground(specimen(60, 40, [222, 218, 206], [30, 40, 120]), 60, 40)
    expect(reading.photographed).toBe(true)
    expect(reading.paper).toBeLessThan(244)
  })

  it('is not fooled by the ink into calling white paper grey', () => {
    // Sampling the whole image rather than the border would average the bar
    // in and report this background as mid-grey.
    const tall = readBackground(specimen(20, 10, [255, 255, 255], [0, 0, 0]), 20, 10)
    expect(tall.paper).toBeCloseTo(255)
  })

  it('does not mistake a tightly cropped transparent signature for paper', () => {
    // Ink touching the edge of a transparent PNG leaves only ink in the
    // border sample. Read as very dark "paper", the lift drives the whole
    // signature transparent — destroying a good specimen by default, since
    // the cleaned version is the one preselected.
    const width = 40
    const height = 20
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        // A diagonal stroke that reaches every edge; everything else clear.
        const onStroke = Math.abs(Math.floor((x / width) * height) - y) <= 1
        data[i] = 20
        data[i + 1] = 20
        data[i + 2] = 20
        data[i + 3] = onStroke ? 255 : 0
      }
    }

    const reading = readBackground(data, width, height)
    expect(reading.photographed).toBe(false)
  })

  it('leaves alone a capture it cannot separate ink from background in', () => {
    // Low contrast: pale pencil on grey. There is nothing to lift without
    // guessing, and guessing here throws away somebody's signature.
    const reading = readBackground(specimen(60, 40, [150, 150, 150], [130, 130, 130]), 60, 40)
    expect(reading.photographed).toBe(false)
  })

  it('treats a transparent surround as no paper at all', () => {
    const data = specimen(20, 20, [255, 255, 255], [0, 0, 0], 0)
    const reading = readBackground(data, 20, 20)
    expect(reading.photographed).toBe(false)
  })
})

describe('lifting the ink', () => {
  it('makes the paper transparent and keeps the ink', () => {
    const width = 60
    const height = 40
    const data = specimen(width, height, [222, 218, 206], [30, 40, 120])
    liftInk(data, readBackground(data, width, height))

    const corner = (0 * width + 0) * 4
    const middle = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4

    expect(data[corner + 3]).toBe(0)
    expect(data[middle + 3]).toBe(255)
  })

  it('keeps a blue pen blue', () => {
    const width = 60
    const height = 40
    const data = specimen(width, height, [222, 218, 206], [30, 40, 120])
    liftInk(data, readBackground(data, width, height))

    const middle = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
    expect(data[middle + 2]).toBeGreaterThan(data[middle])
  })

  it('does almost nothing to a capture that is already clean', () => {
    const width = 60
    const height = 40
    const data = specimen(width, height, [255, 255, 255], [0, 0, 0])
    liftInk(data, readBackground(data, width, height))

    const corner = 0
    const middle = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
    expect(data[corner + 3]).toBe(0)
    expect(data[middle + 3]).toBe(255)
  })
})
