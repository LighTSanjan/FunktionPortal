/** Stamping a stored signature onto a document, shared by both builders. */
import { Paragraph, ImageRun } from 'docx'
import type { SignatureImage } from './types'
import { readImageInfo, fitWithin } from './image-size'

/**
 * The box a stamped signature is fitted into, in pixels at 96dpi. Wide enough
 * to read, short enough to sit on the rule rather than swallow the block.
 */
export const SIGNATURE_BOX = { width: 150, height: 46 } as const

/**
 * The signature, or the empty space it would have occupied.
 *
 * An unsigned document still has to print — it may be signed by hand, and one
 * that collapses its signature block when unstamped invites somebody to sign
 * in the margin.
 */
export function signatureBlock(
  signature: SignatureImage | undefined,
  gapAfter: number
): Paragraph[] {
  if (!signature) return [new Paragraph({ spacing: { after: gapAfter }, children: [] })]

  const size = fitWithin(readImageInfo(signature.data), SIGNATURE_BOX)
  return [
    new Paragraph({
      spacing: { after: 20 },
      children: [
        new ImageRun({ data: signature.data, type: signature.format, transformation: size }),
      ],
    }),
  ]
}
