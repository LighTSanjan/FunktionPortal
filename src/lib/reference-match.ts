/**
 * Whether two written reference numbers are the same document.
 *
 * The register is typed by hand, and it shows: "INC-26-097-0001" for what the
 * portal writes INC26-097-0001, and "IV26-097-00010" with a digit too many for
 * IV26-097-0010. Matching on the parts, not the characters, is what stops a
 * document raised in the portal and copied into the register by hand being
 * counted twice.
 */
const LOOSE = /^\s*(SCF|IV|PO|INC)\s*-?\s*(\d{2})\s*-\s*(\d{3})\s*-\s*(\d{1,6})\s*$/i

export function referenceKey(value: string | null | undefined): string | null {
  const match = LOOSE.exec(value ?? '')
  if (!match) return null
  const [, series, yy, project, sequence] = match
  return `${series.toUpperCase()}${yy}-${project}-${Number(sequence)}`
}

export function sameReference(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = referenceKey(a)
  return left !== null && left === referenceKey(b)
}
