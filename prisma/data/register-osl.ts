/**
 * Every year of the OSL Transaction Register the club still has.
 *
 * FY2024 onward — three years, each transcribed from its own spreadsheet in
 * the club's Drive. Earlier registers exist only as figures carried forward
 * into FY2024's opening rows; the sheets themselves have not survived a
 * handover.
 *
 * Kept as a list rather than three imports at the seed's call site so that
 * adding FY2027 next April is one entry here and nothing else.
 */
import type { OslRegister } from './register-row'
import * as fy2024 from './register-fy2024'
import * as fy2025 from './register-fy2025'
import * as fy2026 from './register-fy2026'

export type { RegisterRow, OslRegister, SectionTotals } from './register-row'

export const OSL_REGISTERS: OslRegister[] = [
  {
    financialYear: 2024,
    sourceFileId: '17P6qbgIUxPSZkarLoHy6bLPYMLxg0vRb',
    seedFund: fy2024.SEED_FUND_ROWS,
    income: fy2024.INCOME_ROWS,
    donation: fy2024.DONATION_ROWS,
    controlTotals: fy2024.CONTROL_TOTALS,
    closingBalanceCents: fy2024.CLOSING_BALANCE_CENTS,
  },
  {
    financialYear: 2025,
    sourceFileId: '1GeYbXELgyzMbrhHQqHMfioPSyI3DJRoJ',
    seedFund: fy2025.SEED_FUND_ROWS,
    income: fy2025.INCOME_ROWS,
    donation: fy2025.DONATION_ROWS,
    controlTotals: fy2025.CONTROL_TOTALS,
    closingBalanceCents: fy2025.CLOSING_BALANCE_CENTS,
  },
  {
    financialYear: 2026,
    sourceFileId: '1RjpUF1tDvh2DJSS9e6L4LwlcNL1_7-h9IgKJPDF7OMU',
    seedFund: fy2026.SEED_FUND_ROWS,
    income: fy2026.INCOME_ROWS,
    donation: fy2026.DONATION_ROWS,
    controlTotals: fy2026.CONTROL_TOTALS,
    closingBalanceCents: fy2026.CLOSING_BALANCE_CENTS,
  },
]
