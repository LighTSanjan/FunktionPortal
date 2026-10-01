/** Match attendance rows by student ID, then email, then unique exact name. */
import type { SheetMember } from './parse'

export interface MemberLike {
  id: string
  fullName: string
  studentId: string | null
  email: string | null
}

export type MatchBasis = 'studentId' | 'email' | 'name'

export interface Match {
  row: SheetMember
  memberId: string
  basis: MatchBasis
}

export interface MatchResult {
  matched: Match[]
  /** Rows with nobody to attach to. They become new members, once confirmed. */
  unmatched: SheetMember[]
  /** Rows the sheet itself cannot identify — no student ID at all. */
  unidentifiable: SheetMember[]
}

export function normaliseStudentId(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

function normaliseEmail(value: string | null | undefined): string | null {
  const email = (value ?? '').trim().toLowerCase()
  // At least one sheet holds "1000123@mymail.sutd.edu sg" — a dot typed as a
  // space. Left alone: correcting an address is not this function's job, and a
  // near-miss should fall through to student ID rather than match something.
  return email.includes('@') ? email : null
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,'’()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchMembers(rows: SheetMember[], existing: MemberLike[]): MatchResult {
  const byStudentId = new Map<string, MemberLike>()
  const byEmail = new Map<string, MemberLike>()
  const byName = new Map<string, MemberLike[]>()

  for (const member of existing) {
    const id = normaliseStudentId(member.studentId)
    if (id) byStudentId.set(id, member)
    const email = normaliseEmail(member.email)
    if (email) byEmail.set(email, member)
    const name = normaliseName(member.fullName)
    byName.set(name, [...(byName.get(name) ?? []), member])
  }

  const matched: Match[] = []
  const unmatched: SheetMember[] = []
  const unidentifiable: SheetMember[] = []

  for (const row of rows) {
    const id = normaliseStudentId(row.studentId)
    if (!id) {
      // No student ID means the import cannot key this row at all, now or on
      // the next run. It is shown as a row needing attention rather than
      // created, so a stray line in the sheet does not become a member.
      unidentifiable.push(row)
      continue
    }

    const byId = byStudentId.get(id)
    if (byId) { matched.push({ row, memberId: byId.id, basis: 'studentId' }); continue }

    const email = normaliseEmail(row.email)
    const byMail = email ? byEmail.get(email) : undefined
    if (byMail) { matched.push({ row, memberId: byMail.id, basis: 'email' }); continue }

    // Only when exactly one existing member carries the name. Two people with
    // the same name is a real case here, and it is precisely the case where
    // guessing does damage.
    const sameName = byName.get(normaliseName(row.fullName)) ?? []
    if (sameName.length === 1) { matched.push({ row, memberId: sameName[0].id, basis: 'name' }); continue }

    unmatched.push(row)
  }

  return { matched, unmatched, unidentifiable }
}

/** Recognise explicit departure labels; unknown free text stays active. */
export function isDepartedLabel(label: string | null): boolean {
  return label !== null && /graduated|left after|exited|alumni/i.test(label)
}
