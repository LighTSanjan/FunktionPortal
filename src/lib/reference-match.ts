/**
 * Whether a row typed into the club's spreadsheet register is a document the
 * portal raised.
 *
 * The register is typed by hand, and it shows: "INC-26-097-0001" for what the
 * portal writes INC26-097-0001, and "IV26-097-00012" — a digit too many —
 * for what is really IV26-097-0011. So:
 *
 *  - A well-formed number is matched exactly, ignoring only case, spaces and
 *    the hyphen after the series. IV26-097-0012 is never IV26-097-0011.
 *  - A malformed number is matched by what it must be: the same series and
 *    year, the same amount, on the same day — and each sheet row stands for
 *    one document at most.
 *
 * Stripping leading zeros instead made "00012" equal a real 0012 raised later
 * and miss the 0011 it was meant for, counting one invoice twice and hiding
 * another.
 */
const STRICT = /^\s*(SCF|IV|PO|INC)\s*-?\s*(\d{2})\s*-\s*(\d{3})\s*-\s*(\d{4})\s*$/i
const LOOSE = /^\s*(SCF|IV|PO|INC)\s*-?\s*(\d{2})\s*-\s*(\d{3})\s*-\s*\d+\s*$/i

export function referenceKey(value: string | null | undefined): string | null {
  const match = STRICT.exec(value ?? '')
  if (!match) return null
  const [, series, yy, project, sequence] = match
  return `${series.toUpperCase()}${yy}-${project}-${sequence}`
}

/** The series and year of a number too mangled to match exactly. */
function looseKey(value: string | null | undefined): string | null {
  const match = LOOSE.exec(value ?? '')
  return match ? `${match[1].toUpperCase()}${match[2]}-${match[3]}` : null
}

export function sameReference(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = referenceKey(a)
  return left !== null && left === referenceKey(b)
}

export interface LedgerDocument {
  reference: string | null
  /** Unsigned: what moved, in or out. */
  amountCents: number
  date: Date | null
}

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

/**
 * Which portal documents are already on the sheet. Returns the indexes of
 * `portal` that a sheet row accounts for; no sheet row accounts for two.
 */
export function onSheet(sheet: LedgerDocument[], portal: LedgerDocument[]): Set<number> {
  const matched = new Set<number>()
  const used = new Set<number>()

  // Exact numbers first, so a malformed row never claims a document a
  // well-formed row already names.
  portal.forEach((doc, i) => {
    const key = referenceKey(doc.reference)
    if (!key) return
    const row = sheet.findIndex((candidate, j) => !used.has(j) && referenceKey(candidate.reference) === key)
    if (row !== -1) {
      used.add(row)
      matched.add(i)
    }
  })

  // Then each malformed row, against the documents nothing has claimed: the
  // same series and year, the same amount, the same day. Where two documents
  // fit, the one whose number reads like what was typed wins — "00002" is
  // 0002 before it is 0001.
  const digits = (value: string | null) => Number(/(\d+)\s*$/.exec(value ?? '')?.[1] ?? NaN)
  sheet.forEach((row, j) => {
    if (used.has(j) || referenceKey(row.reference) !== null) return
    const rowKey = looseKey(row.reference)
    if (!rowKey || day(row.date) === null) return
    const fits = portal
      .map((doc, i) => ({ doc, i }))
      .filter(({ doc, i }) => {
        const key = referenceKey(doc.reference)
        return (
          !matched.has(i) &&
          key !== null &&
          key.slice(0, key.lastIndexOf('-')) === rowKey &&
          doc.amountCents === row.amountCents &&
          day(doc.date) === day(row.date)
        )
      })
    const pick = fits.find(({ doc }) => digits(doc.reference) === digits(row.reference)) ?? fits[0]
    if (pick) {
      used.add(j)
      matched.add(pick.i)
    }
  })

  return matched
}
