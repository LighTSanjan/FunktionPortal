/**
 * The money side of a term collection.
 *
 * GST is derived, never entered (Finance Guidelines §2). The club collects a
 * gross figure — what members actually transfer — and the Income Deposit Form
 * has to state the net and the tax separately. Typing either by hand is how
 * the three figures stop adding up.
 */

/** 9% as basis points, the default in organisation settings. */
export const DEFAULT_GST_BASIS_POINTS = 900

export interface GstSplit {
  grossCents: number
  netCents: number
  gstCents: number
}

/**
 * Split a gross amount into net and tax.
 *
 * The gross is inclusive, so this divides rather than multiplies:
 * net = gross × 10000 / (10000 + rate). The tax is then the remainder rather
 * than a second rounding, which is what guarantees net + gst === gross for
 * every input — including the ones where an honest rounding of each part
 * separately would come to a cent more or less than what was banked.
 */
export function splitGst(grossCents: number, basisPoints: number): GstSplit {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error(`Gross must be a whole number of cents, got ${grossCents}`)
  }
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error(`GST must be whole basis points, got ${basisPoints}`)
  }

  const netCents = Math.round((grossCents * 10_000) / (10_000 + basisPoints))
  return { grossCents, netCents, gstCents: grossCents - netCents }
}

/**
 * Donations are exempt (§2.2), which is a different statement from a zero
 * rate: there is no tax component at all, and the form says so.
 */
export function exemptSplit(grossCents: number): GstSplit {
  return { grossCents, netCents: grossCents, gstCents: 0 }
}
