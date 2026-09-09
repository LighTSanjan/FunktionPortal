/**
 * Preparing an instructor for an invoice.
 *
 * Two contracted coaches teach the standing weekdays, and the club also books
 * guests for the occasional workshop. The document code never knew the
 * difference — it takes plain details — but the guest path needs guarding,
 * because a contracted coach's details were checked once when the contract
 * was filed and a guest's are typed fresh under time pressure on the day the
 * invoice is due.
 *
 * Pure functions. Nothing here imports Prisma: the caller maps its record
 * into InstructorDetails, which keeps document rendering testable without a
 * database and without a schema.
 */
import type { InstructorDetails } from './types'

/** A field the invoice cannot be raised without, and why. */
const REQUIRED: Array<{ key: keyof InstructorDetails; label: string; because: string }> = [
  { key: 'fullName', label: 'name', because: 'it is the name the university pays' },
  { key: 'danceStyle', label: 'class or style', because: 'it describes every line on the invoice' },
  { key: 'bankName', label: 'bank', because: 'the invoice is how they get paid' },
  { key: 'bankAccountNo', label: 'bank account number', because: 'the invoice is how they get paid' },
]

export class IncompleteInstructorError extends Error {
  constructor(readonly missing: string[], instructorName?: string) {
    super(
      `Cannot raise an invoice for ${instructorName || 'this instructor'}: ` +
        `missing ${missing.join(', ')}. ` +
        'A guest coach has no contract on file to recover these from, so they have to be entered.',
    )
    this.name = 'IncompleteInstructorError'
  }
}

function blank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

/**
 * Refuses to build an invoice that cannot achieve its purpose.
 *
 * An address is not required — plenty of guests bill from an email alone —
 * but a payee name and a bank account are, because an invoice missing either
 * is a document that looks complete and pays nobody.
 */
export function assertInvoiceable(instructor: InstructorDetails): void {
  const missing = REQUIRED.filter(({ key }) => blank(instructor[key])).map((f) => f.label)

  if (missing.length > 0) {
    throw new IncompleteInstructorError(missing, instructor.fullName)
  }
}

/**
 * A short code for the issuer's own document number, when the instructor has
 * none on file.
 *
 * A fallback, never an override. The contracted coaches' codes are what they
 * have always written on their own invoices and are not derivable — one is a
 * stage name, not initials — so a stored code always wins. This exists so a
 * guest booked the same afternoon still gets a sensible number instead of a
 * blank one.
 */
export function deriveShortCode(fullName: string): string {
  const initials = fullName
    // Drop anything parenthesised: "Ada Lim (Sparky)" is one person, not two.
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 4)

  if (initials.length === 0) {
    throw new Error(`Cannot derive a document code from the name "${fullName}"`)
  }
  return initials
}

/** The stored code if there is one, otherwise initials. */
export function shortCodeFor(instructor: InstructorDetails, storedShortCode?: string | null): string {
  return storedShortCode?.trim() || deriveShortCode(instructor.fullName)
}
