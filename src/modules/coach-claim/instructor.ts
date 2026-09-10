/** Validate and normalise instructor details used on invoices. */
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

export function assertInvoiceable(instructor: InstructorDetails): void {
  const missing = REQUIRED.filter(({ key }) => blank(instructor[key])).map((f) => f.label)

  if (missing.length > 0) {
    throw new IncompleteInstructorError(missing, instructor.fullName)
  }
}

/** Derive a fallback document code when an instructor has none stored. */
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
