/**
 * The questions of the club's own on a membership form, and reading answers
 * to them. Pure: the form page, the action and the responses export all read
 * answers through here, so a question means the same thing in all three.
 */
import type { FormQuestionType } from '@prisma/client'

export interface Question {
  id: string
  type: FormQuestionType
  label: string
  help: string | null
  required: boolean
  options: string[]
}

/** One answer, carrying the question's wording as it was when answered. */
export interface Answer {
  questionId: string
  label: string
  type: FormQuestionType
  value: string | string[]
}

export const QUESTION_TYPES: { type: FormQuestionType; label: string; hint: string }[] = [
  { type: 'SHORT_TEXT', label: 'Short answer', hint: 'A Telegram handle, a shirt size' },
  { type: 'LONG_TEXT', label: 'Paragraph', hint: 'Anything they want to tell you' },
  { type: 'YES_NO', label: 'Yes or no', hint: 'Coming to the welcome jam?' },
  { type: 'ONE_CHOICE', label: 'Pick one', hint: 'Popping, locking or both' },
  { type: 'MANY_CHOICES', label: 'Pick any', hint: 'Which sessions they can make' },
]

export const TYPE_LABEL: Record<FormQuestionType, string> = Object.fromEntries(
  QUESTION_TYPES.map((entry) => [entry.type, entry.label])
) as Record<FormQuestionType, string>

export const MAX_SHORT = 200
export const MAX_LONG = 2000
export const MAX_OPTIONS = 20

export function needsOptions(type: FormQuestionType): boolean {
  return type === 'ONE_CHOICE' || type === 'MANY_CHOICES'
}

/** One choice per line, blank lines and repeats dropped. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const option = line.trim().slice(0, 100)
    if (!option || seen.has(option.toLowerCase())) continue
    seen.add(option.toLowerCase())
    options.push(option)
  }
  return options
}

/** The form field a question's answer is posted under. */
export function fieldName(questionId: string): string {
  return `q_${questionId}`
}

export type ReadAnswers =
  | { ok: true; answers: Answer[] }
  | { ok: false; errors: Record<string, string> }

/**
 * Answers out of a posted form, checked against the questions.
 *
 * Only questions on the form are read, so nothing posted under another name
 * gets stored. A choice has to be one of the choices; an answer to "Pick one"
 * that is not on the list is somebody editing the page, not an answer.
 */
export function readAnswers(questions: Question[], formData: FormData): ReadAnswers {
  const answers: Answer[] = []
  const errors: Record<string, string> = {}

  for (const question of questions) {
    const name = fieldName(question.id)
    let value: string | string[]

    switch (question.type) {
      case 'MANY_CHOICES': {
        const picked = formData
          .getAll(name)
          .map(String)
          .filter((option) => question.options.includes(option))
        value = [...new Set(picked)]
        if (question.required && value.length === 0) errors[question.id] = 'Pick at least one.'
        break
      }
      case 'ONE_CHOICE': {
        const picked = String(formData.get(name) ?? '')
        value = question.options.includes(picked) ? picked : ''
        if (question.required && !value) errors[question.id] = 'Pick one.'
        break
      }
      case 'YES_NO': {
        const picked = String(formData.get(name) ?? '')
        value = picked === 'Yes' || picked === 'No' ? picked : ''
        if (question.required && !value) errors[question.id] = 'Pick yes or no.'
        break
      }
      default: {
        const max = question.type === 'LONG_TEXT' ? MAX_LONG : MAX_SHORT
        value = String(formData.get(name) ?? '').trim()
        if (value.length > max) errors[question.id] = `Keep it under ${max} characters.`
        else if (question.required && !value) errors[question.id] = 'This one is required.'
      }
    }

    answers.push({ questionId: question.id, label: question.label, type: question.type, value })
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers }
}

/** An answer as one line of text, for the responses list and the export. */
export function answerText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ')
  return value ?? ''
}

/** Stored answers, tolerating anything the column holds that is not one. */
export function storedAnswers(raw: unknown): Answer[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (entry): entry is Answer =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Answer).questionId === 'string' &&
      typeof (entry as Answer).label === 'string'
  )
}

export interface Birthday {
  day: number
  month: number
  year: number | null
}

/**
 * A birthday from three fields. Day and month are asked for; the year is not,
 * because the club sends birthday messages and never needs it — the same
 * reason the roster keeps it optional.
 */
export function readBirthday(day: string, month: string, year: string): Birthday | string {
  const d = Number(day)
  const m = Number(month)
  if (!Number.isInteger(d) || !Number.isInteger(m) || m < 1 || m > 12 || d < 1) {
    return 'Put in the day and month of your birthday.'
  }
  const longest = new Date(Date.UTC(2000, m, 0)).getUTCDate()
  if (d > longest) return 'That day is not in that month.'
  if (year.trim() === '') return { day: d, month: m, year: null }
  const y = Number(year)
  const now = new Date().getFullYear()
  if (!Number.isInteger(y) || y < now - 100 || y > now - 10) return 'That year does not look right.'
  if (m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) {
    return `${y} was not a leap year.`
  }
  return { day: d, month: m, year: y }
}

/**
 * "1001234" out of whatever somebody typed — "1001234", " 100 1234", or
 * "1001234@mymail.sutd.edu.sg" pasted from their email.
 */
export function readStudentId(typed: string): string | null {
  const digits = typed.split('@')[0].replace(/\D/g, '')
  return /^\d{7}$/.test(digits) ? digits : null
}

/** Rough likeness of two names, for suggesting a roster row. Never for linking. */
export function sameName(a: string, b: string): boolean {
  const words = (name: string) =>
    new Set(
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 1)
    )
  const left = words(a)
  const right = words(b)
  if (left.size === 0 || right.size === 0) return false
  let shared = 0
  for (const word of left) if (right.has(word)) shared++
  return shared >= Math.min(2, Math.min(left.size, right.size))
}
