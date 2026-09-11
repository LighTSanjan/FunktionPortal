/**
 * Lifting a signature off the paper it was photographed on.
 *
 * Most people upload a clean digital capture: black ink, white background,
 * nothing to do. Some photograph a signature on paper, and that arrives as an
 * opaque rectangle of cream or grey which gets stamped onto a white form —
 * visibly a photograph pasted onto a document, which is exactly the
 * impression an official claim should not give.
 *
 * These operate on raw RGBA the way a canvas hands it over, so they are
 * testable without a browser and run in one.
 */

/** Rec. 709 luminance, the one that matches how dark ink looks. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export interface BackgroundReading {
  /** Typical luminance of the border, 0–255. Paper, in a photograph. */
  paper: number
  /** Typical luminance of the darkest few per cent. The ink. */
  ink: number
  /**
   * Whether this looks like a photograph of paper rather than a digital
   * capture — a border that is not white, or is not uniform.
   */
  photographed: boolean
}

/**
 * What the edges say about the background.
 *
 * The border is sampled rather than the whole image because the middle is
 * mostly signature: a mean over everything is dragged down by the ink and
 * would report cream paper as grey.
 */
export function readBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number
): BackgroundReading {
  const border: number[] = []
  const all: number[] = []

  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4
    // A transparent pixel is not evidence about the paper; it is the absence
    // of paper, which is what a clean PNG capture looks like at the edges.
    if (data[i + 3] < 8) return null
    return luminance(data[i], data[i + 1], data[i + 2])
  }

  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.02))
  for (let x = 0; x < width; x++) {
    for (const y of [inset, height - 1 - inset]) {
      const l = at(x, y)
      if (l !== null) border.push(l)
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [inset, width - 1 - inset]) {
      const l = at(x, y)
      if (l !== null) border.push(l)
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 8) all.push(luminance(data[i], data[i + 1], data[i + 2]))
  }

  // An image that is transparent all the way round has no paper in it.
  if (border.length === 0 || all.length === 0) {
    return { paper: 255, ink: 0, photographed: false }
  }

  border.sort((a, b) => a - b)
  all.sort((a, b) => a - b)

  const paper = border[Math.floor(border.length / 2)]
  const ink = all[Math.floor(all.length * 0.02)]
  // Spread across the border: uniform means a flat digital background, wide
  // means the uneven lighting of a photograph.
  const spread = border[Math.floor(border.length * 0.9)] - border[Math.floor(border.length * 0.1)]

  return {
    paper,
    ink,
    photographed: paper < 244 || spread > 18,
  }
}

/**
 * Make the paper transparent and leave the ink.
 *
 * Alpha is a ramp between the two luminances rather than a threshold: a
 * threshold turns the edge of every stroke into a staircase, and a signature
 * is nothing but edges. Colour is kept, so a blue pen stays a blue pen.
 */
export function liftInk(
  data: Uint8ClampedArray,
  reading: BackgroundReading
): void {
  const paper = reading.paper
  const ink = Math.min(reading.ink, paper - 1)
  const range = Math.max(1, paper - ink)

  for (let i = 0; i < data.length; i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2])
    // 0 at paper, 1 at ink.
    let t = (paper - l) / range
    // Pull the paper's own noise to nothing and let the ink reach full
    // opacity before the very darkest pixel, so strokes are solid rather
    // than perpetually slightly grey.
    //
    // The floor was 0.18 and left a shadow from one corner of the photograph
    // standing as a grey smudge on the page. 0.30 removes it without eating
    // into the thin ends of strokes, checked against the real specimen.
    t = (t - 0.3) / 0.5
    const alpha = Math.max(0, Math.min(1, t))

    data[i + 3] = Math.round(data[i + 3] * alpha)

    // Where the ink is faint, darken it towards what it would be at full
    // strength. Without this a pencil signature lifts off as a grey ghost.
    if (alpha > 0 && alpha < 1) {
      const boost = 0.35
      data[i] = Math.round(data[i] * (1 - boost))
      data[i + 1] = Math.round(data[i + 1] * (1 - boost))
      data[i + 2] = Math.round(data[i + 2] * (1 - boost))
    }
  }
}
