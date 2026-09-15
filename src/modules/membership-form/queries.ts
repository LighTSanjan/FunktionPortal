/** Reading a term's membership form, for the person filling it in and the exco. */
import 'server-only'
import type { FormAudience, FormState } from '@prisma/client'
import { dbAs } from '@/core/db'
import { sameName, storedAnswers, type Answer, type Question } from './questions'

export interface FormView {
  /** Null only for a term made before forms existed and never touched since. */
  id: string | null
  termId: string
  state: FormState
  intro: string | null
  audience: FormAudience
  /** The roster rows it is for, when the audience is CHOSEN. */
  recipientIds: string[]
  openedAt: Date | null
  closedAt: Date | null
  questions: Question[]
}

export async function getForm(userId: string, orgId: string, termId: string): Promise<FormView> {
  const form = await dbAs(userId, (tx) =>
    tx.membershipForm.findFirst({
      where: { orgId, termId },
      include: { questions: { orderBy: { position: 'asc' } }, recipients: { select: { memberId: true } } },
    })
  )
  if (!form) {
    return {
      id: null,
      termId,
      state: 'DRAFT',
      intro: null,
      audience: 'EVERYONE',
      recipientIds: [],
      openedAt: null,
      closedAt: null,
      questions: [],
    }
  }
  return {
    id: form.id,
    termId,
    state: form.state,
    intro: form.intro,
    audience: form.audience,
    // A member reads only their own recipient row, so for them this is at
    // most themselves — which is all "is it for me" needs.
    recipientIds: form.recipients.map((row) => row.memberId),
    openedAt: form.openedAt,
    closedAt: form.closedAt,
    questions: form.questions.map((q) => ({
      id: q.id,
      type: q.type,
      label: q.label,
      help: q.help,
      required: q.required,
      options: q.options,
    })),
  }
}

export interface OwnResponse {
  id: string
  memberId: string | null
  fullName: string
  studentId: string | null
  birthDay: number | null
  birthMonth: number | null
  birthYear: number | null
  answers: Answer[]
  /** A payment made before the response reached a roster row. */
  held: { reference: string | null; amountCents: number | null; at: Date | null } | null
  submittedAt: Date
  updatedAt: Date
}

export async function getOwnResponse(
  userId: string,
  orgId: string,
  termId: string
): Promise<OwnResponse | null> {
  const row = await dbAs(userId, (tx) =>
    tx.membershipResponse.findFirst({ where: { orgId, termId, userId } })
  )
  if (!row) return null
  return {
    id: row.id,
    memberId: row.memberId,
    fullName: row.fullName,
    studentId: row.studentId,
    birthDay: row.birthDay,
    birthMonth: row.birthMonth,
    birthYear: row.birthYear,
    answers: storedAnswers(row.answers),
    held: row.heldProofPath
      ? { reference: row.heldReference, amountCents: row.heldAmountCents, at: row.heldAt }
      : null,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
  }
}

export interface RosterCandidate {
  id: string
  fullName: string
  studentId: string | null
  /** Why it is suggested: the ID, the name, the birthday — each a hint. */
  reasons: string[]
  /** Already linked to the account that sent the response. */
  sameAccount: boolean
}

export interface ResponseRow {
  id: string
  userId: string
  email: string
  memberId: string | null
  memberName: string | null
  fullName: string
  studentId: string | null
  birthday: string | null
  answers: Answer[]
  held: { reference: string | null; amountCents: number | null; hasProof: boolean } | null
  submittedAt: Date
  updatedAt: Date
  matchedByName: string | null
  /**
   * For a response not yet on the roster: rows it might be, best first. Empty
   * means nobody on the roster looks like them and they are new.
   */
  candidates: RosterCandidate[]
  /** A roster row already has this student ID, linked to somebody else. */
  idTakenBy: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function birthdayLabel(day: number | null, month: number | null, year: number | null): string | null {
  if (!day || !month) return null
  return `${day} ${MONTHS[month - 1]}${year ? ` ${year}` : ''}`
}

/**
 * Every response to one term's form, for the exco.
 *
 * A response not yet on the roster comes with the rows it might be. The
 * suggestion is only ever shown to the exco, who know these people; the
 * person who sent it is never told whether their student ID is on the roster.
 */
export async function listResponses(userId: string, orgId: string, termId: string): Promise<ResponseRow[]> {
  const { responses, roster } = await dbAs(userId, async (tx) => ({
    responses: await tx.membershipResponse.findMany({
      where: { orgId, termId },
      orderBy: { submittedAt: 'desc' },
      include: {
        member: { select: { fullName: true } },
        matchedBy: { select: { name: true } },
      },
    }),
    roster: await tx.member.findMany({
      where: { orgId },
      select: {
        id: true,
        fullName: true,
        studentId: true,
        userId: true,
        birthDay: true,
        birthMonth: true,
      },
    }),
  }))

  return responses.map((row) => {
    let candidates: RosterCandidate[] = []
    let idTakenBy: string | null = null

    if (!row.memberId) {
      const scored = roster
        .map((member) => {
          const reasons: string[] = []
          const sameAccount = member.userId === row.userId
          if (sameAccount) reasons.push('signed in as them')
          if (row.studentId && member.studentId === row.studentId) reasons.push('same student ID')
          if (sameName(member.fullName, row.fullName)) reasons.push('same name')
          if (
            row.birthDay &&
            row.birthMonth &&
            member.birthDay === row.birthDay &&
            member.birthMonth === row.birthMonth
          ) {
            reasons.push('same birthday')
          }
          return { member, reasons, sameAccount }
        })
        // A birthday alone is shared by one in 365; it only counts beside something else.
        .filter(({ reasons }) => reasons.length > 0 && !(reasons.length === 1 && reasons[0] === 'same birthday'))

      for (const { member } of scored) {
        if (row.studentId && member.studentId === row.studentId && member.userId && member.userId !== row.userId) {
          idTakenBy = member.fullName
        }
      }

      candidates = scored
        .filter(({ member, sameAccount }) => sameAccount || !member.userId)
        .sort((a, b) => Number(b.sameAccount) - Number(a.sameAccount) || b.reasons.length - a.reasons.length)
        .slice(0, 3)
        .map(({ member, reasons, sameAccount }) => ({
          id: member.id,
          fullName: member.fullName,
          studentId: member.studentId,
          reasons,
          sameAccount,
        }))
    }

    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      memberId: row.memberId,
      memberName: row.member?.fullName ?? null,
      fullName: row.fullName,
      studentId: row.studentId,
      birthday: birthdayLabel(row.birthDay, row.birthMonth, row.birthYear),
      answers: storedAnswers(row.answers),
      held: row.heldProofPath || row.heldReference
        ? { reference: row.heldReference, amountCents: row.heldAmountCents, hasProof: Boolean(row.heldProofPath) }
        : null,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
      matchedByName: row.matchedBy?.name ?? null,
      candidates,
      idTakenBy,
    }
  })
}

/** The stored screenshot key held on one response, for the exco. */
export async function heldProofKeyFor(userId: string, orgId: string, responseId: string): Promise<string | null> {
  const row = await dbAs(userId, (tx) =>
    tx.membershipResponse.findFirst({ where: { id: responseId, orgId }, select: { heldProofPath: true } })
  )
  return row?.heldProofPath ?? null
}

/**
 * Whether this form is for this person. Everybody's, or only the roster rows
 * the exco chose — and somebody not on the roster is never one of those.
 */
export function formIsFor(form: Pick<FormView, 'audience' | 'recipientIds'>, memberId: string | null): boolean {
  if (form.audience === 'EVERYONE') return true
  return memberId !== null && form.recipientIds.includes(memberId)
}
