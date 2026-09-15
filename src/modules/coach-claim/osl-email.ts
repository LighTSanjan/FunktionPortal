/**
 * The email that goes to the club's OSL representative with a month's coach
 * payments: one email for the month, naming every coach whose invoice and
 * attendance sheet are attached. Worded the way the treasurer has always
 * written it, because that is what the Office of Student Life is used to
 * reading.
 */
import { MONTHS } from './theme'

export interface EmailCoach {
  fullName: string
  shortCode: string
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

export function coachPaymentEmail(args: {
  periodYear: number
  periodMonth: number
  coaches: EmailCoach[]
}): { subject: string; body: string } {
  const period = `${MONTHS[args.periodMonth - 1]} ${args.periodYear}`
  const which = (index: number) =>
    args.coaches.length === 1 ? 'the coach' : `${ORDINALS[index] ?? `coach ${index + 1}`} coach`

  const lines = args.coaches.map(
    (coach, index) =>
      `·   The invoice from ${which(index)} for ${period} club sessions: ${coach.fullName} (${coach.shortCode}) + Attendance sheet for ${period}`
  )

  return {
    subject: `Coach Payment for ${period}`,
    body: [
      `For the month of ${period}, attached are the necessary documents for instructor's payment:`,
      '',
      ...lines.flatMap((line, index) => (index === 0 ? [line] : ['', line])),
    ].join('\n'),
  }
}
