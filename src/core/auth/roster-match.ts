/**
 * Which roster row a proven address belongs to. Pure; see roster-link.ts for
 * why these are the only two rules.
 */

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Student addresses that are the student ID itself. */
const STUDENT_ID_DOMAINS = ['mymail.sutd.edu.sg']
const STUDENT_ID = /^\d{7}$/

/** "1009153" from 1009153@mymail.sutd.edu.sg, and nothing from anything else. */
export function studentIdFromEmail(email: string): string | null {
  const [local, domain] = normaliseEmail(email).split('@')
  if (!domain || !STUDENT_ID_DOMAINS.includes(domain)) return null
  return STUDENT_ID.test(local) ? local : null
}

export interface RosterCandidate {
  id: string
  email: string | null
  studentId: string | null
}

export type MatchRule = 'email' | 'student_id'

/**
 * The one roster row a proven address belongs to, or null.
 *
 * Pure, so the rules above can be tested without a database. Rows passed in
 * must already be unlinked.
 */
export function matchRosterRow(
  provenEmail: string,
  rows: RosterCandidate[]
): { memberId: string; rule: MatchRule } | null {
  const email = normaliseEmail(provenEmail)
  const studentId = studentIdFromEmail(email)

  const found = new Map<string, MatchRule>()
  for (const row of rows) {
    if (row.email && normaliseEmail(row.email) === email) found.set(row.id, 'email')
    if (studentId && row.studentId?.replace(/\D/g, '') === studentId && !found.has(row.id)) {
      found.set(row.id, 'student_id')
    }
  }
  if (found.size !== 1) return null
  const [[memberId, rule]] = [...found]
  return { memberId, rule }
}

