import 'server-only'

import { dbAdmin } from '@/core/db/admin'
import { writeAudit } from '@/core/audit'
import { matchRosterRow, type MatchRule } from './roster-match'

/**
 * Attaching accounts to roster rows without anybody having to.
 *
 * A User is somebody who can sign in; a Member is a row on the attendance
 * sheet. They are joined only on something the account has PROVEN — never on
 * what somebody typed:
 *
 *   - the roster's email for the row is the account's proven address, or
 *   - the account's proven address is a student address whose local part is
 *     the row's student ID: 1001234@mymail.sutd.edu.sg is student 1001234.
 *
 * A typed student ID proves nothing — they are printed on every attendance
 * sheet and run in sequence — so it is still shown to the exco to confirm.
 * Alumni addresses are firstname_lastname and carry no ID, and a name is not
 * a key. Anything that matches more than one row, or a row more than one
 * account matches, links nobody and is left for a person.
 */

/**
 * Whether this account has already decided a payment for this roster row.
 *
 * Linking it then would make that decision a confirmation of its own fee —
 * after the fact, where no check at the time could have caught it. Left for
 * a person to sort out instead.
 */
async function decidedOwnFee(userId: string, memberId: string): Promise<boolean> {
  const decided = await dbAdmin.feePayment.findFirst({
    where: { memberId, confirmedByUserId: userId },
    select: { id: true },
  })
  return decided !== null
}

/**
 * Link one proven account to its roster row, if exactly one is its.
 *
 * Only rosters of clubs the account belongs to: searching every organisation
 * would attach somebody to a club they never joined.
 */
export async function linkAccountToRoster(userId: string, provenEmail: string): Promise<boolean> {
  const already = await dbAdmin.member.findFirst({ where: { userId }, select: { id: true } })
  if (already) return false

  const memberships = await dbAdmin.organisationMembership.findMany({
    where: { userId, isActive: true },
    select: { orgId: true },
  })
  if (memberships.length === 0) return false

  const rows = await dbAdmin.member.findMany({
    where: { orgId: { in: memberships.map((row) => row.orgId) }, userId: null },
    select: { id: true, orgId: true, email: true, studentId: true },
  })
  const match = matchRosterRow(provenEmail, rows)
  if (!match || (await decidedOwnFee(userId, match.memberId))) return false

  const claimed = await dbAdmin.member.updateMany({
    where: { id: match.memberId, userId: null },
    data: { userId },
  })
  if (claimed.count !== 1) return false

  const row = rows.find((candidate) => candidate.id === match.memberId)!
  await writeAudit({
    orgId: row.orgId,
    actorId: userId,
    action: 'member.link_account_auto',
    targetType: 'Member',
    targetId: row.id,
    after: { userId, rule: match.rule },
  })
  return true
}

/**
 * Link every proven account in a club to its roster row.
 *
 * Run after an attendance import, which is when new rows appear for people
 * who signed in before the sheet had them. A row two accounts both match is
 * skipped: somebody is wrong, and that is a conversation, not a link.
 */
export async function linkRosterToAccounts(orgId: string, actorId: string): Promise<number> {
  const [rows, accounts] = await Promise.all([
    dbAdmin.member.findMany({
      where: { orgId, userId: null },
      select: { id: true, email: true, studentId: true },
    }),
    dbAdmin.user.findMany({
      where: {
        emailProvenAt: { not: null },
        member: null,
        memberships: { some: { orgId, isActive: true } },
      },
      select: { id: true, email: true },
    }),
  ])
  if (rows.length === 0 || accounts.length === 0) return 0

  const proposals = new Map<string, { userId: string; rule: MatchRule }[]>()
  for (const account of accounts) {
    const match = matchRosterRow(account.email, rows)
    if (!match) continue
    proposals.set(match.memberId, [...(proposals.get(match.memberId) ?? []), { userId: account.id, rule: match.rule }])
  }

  let linked = 0
  for (const [memberId, claims] of proposals) {
    if (claims.length !== 1) continue
    const [{ userId, rule }] = claims
    if (await decidedOwnFee(userId, memberId)) continue
    const claimed = await dbAdmin.member.updateMany({
      where: { id: memberId, userId: null },
      data: { userId },
    })
    if (claimed.count !== 1) continue
    await writeAudit({
      orgId,
      actorId,
      action: 'member.link_account_auto',
      targetType: 'Member',
      targetId: memberId,
      after: { userId, rule },
    })
    linked++
  }
  return linked
}

export interface RosterRowForId {
  id: string
  fullName: string
  birthDay: number | null
  birthMonth: number | null
  birthYear: number | null
  /** Already somebody's: another login has this student ID. */
  linkedTo: string | null
}

/** The roster row with this student ID in one club, linked or not. */
export async function rosterRowForStudentId(orgId: string, studentId: string): Promise<RosterRowForId | null> {
  const row = await dbAdmin.member.findFirst({
    where: { orgId, studentId },
    select: { id: true, fullName: true, birthDay: true, birthMonth: true, birthYear: true, userId: true },
  })
  if (!row) return null
  const { userId, ...rest } = row
  return { ...rest, linkedTo: userId }
}

export type SelfLink = 'linked' | 'taken' | 'none'

/** Said to somebody whose student ID another login already has. */
export const ID_TAKEN =
  'That student ID is already linked to another login. Sign in that way instead — you can add Google to it in Settings.'

/**
 * Link an account to the roster row with the student ID it typed.
 *
 * The club chose this over waiting for an exco member: somebody coming back
 * types their ID and is in. A row that is already somebody's is never moved,
 * so the worst a wrong ID does is take a free row, which the exco can see in
 * the audit log and undo from the roster.
 */
export async function linkAccountByStudentId(userId: string, orgId: string, studentId: string): Promise<SelfLink> {
  const already = await dbAdmin.member.findFirst({ where: { userId }, select: { id: true } })
  if (already) return 'none'

  const row = await rosterRowForStudentId(orgId, studentId)
  if (!row) return 'none'
  if (row.linkedTo) return row.linkedTo === userId ? 'linked' : 'taken'
  if (await decidedOwnFee(userId, row.id)) return 'none'

  const claimed = await dbAdmin.member.updateMany({
    where: { id: row.id, orgId, userId: null },
    data: { userId },
  })
  if (claimed.count !== 1) return 'taken'

  await writeAudit({
    orgId,
    actorId: userId,
    action: 'member.link_account_self',
    targetType: 'Member',
    targetId: row.id,
    after: { userId, studentId, memberName: row.fullName },
  })
  return 'linked'
}
