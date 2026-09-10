/** Add weekdays without mutating the input; public holidays are not modelled. */
export function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(from)
  let added = 0
  while (added < days) {
    date.setDate(date.getDate() + 1)
    const day = date.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return date
}

/** §3.1.2: an invoice reaches OSL within three working days of its own date. */
export const OSL_SUBMISSION_WORKING_DAYS = 3
