/** What a fee action tells the form that called it. */
export interface FeeState {
  error: string | null
  ok?: boolean
  /** What happened, when it is more than "saved". */
  message?: string
}

/**
 * Prisma's unique-violation code.
 *
 * A unique key is what really serialises two exco members doing the same
 * thing at once — closing a collection, recording a payment. The precheck
 * before it only makes the usual case say something useful; the loser of the
 * race is told what happened rather than shown a stack trace.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}
