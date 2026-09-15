/**
 * A spreadsheet-safe CSV.
 *
 * A byte-order mark so Excel reads the names as UTF-8, and any cell starting
 * with = + - @ prefixed with an apostrophe: answers are typed by members, and
 * a spreadsheet would otherwise run one as a formula on the treasurer's laptop.
 */
export function toCsv(rows: string[][]): string {
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
