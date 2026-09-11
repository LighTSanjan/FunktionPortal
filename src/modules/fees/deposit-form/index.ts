/**
 * The DBS Max Income Deposit Form, filled in.
 *
 * OSL's own workbook with our figures written into its blanks — not a
 * reconstruction of it. A Class B document is accepted because it looks like
 * the one they have been accepting for years, so every border, font, GL
 * account code and formula in it stays theirs.
 *
 * The form computes GST itself, as gross/109 — nine per cent, hard-coded in
 * OSL's own cells. Where the club is configured for a different rate the two
 * would disagree, and rather than quietly overwrite OSL's formula with our
 * arithmetic, the disagreement is reported to the treasurer.
 */
import JSZip from 'jszip'
import { Sheet } from './sheet'
import { depositFormTemplate, DEPOSIT_FORM_REVISION } from './template'

export { DEPOSIT_FORM_REVISION }

/** One row of the form's Breakdown table. */
export interface DepositLine {
  description: string
  unitPriceCents: number
  quantity: number
}

export interface DepositFormInput {
  /** As allocated, e.g. IV26-097-0004. Null prints OSL's own blank. */
  referenceNumber: string | null
  organisationName: string
  eventName: string
  /** As it should read on the form, already formatted. */
  eventDate: string
  description: string
  /** Revenue-side WBS, e.g. PN-00097-A3006-A3006-R00. */
  wbsElement: string
  lines: readonly DepositLine[]
  submittedBy: {
    name: string
    /**
     * The form asks for it. Null leaves the cell blank rather than inventing
     * one — a wrong matriculation number on a financial document is worse
     * than an empty box somebody fills in by hand.
     */
    studentId: string | null
    designation: string
  }
  /** What the club is configured to charge, to check against OSL's 9%. */
  gstBasisPoints: number
}

export interface DepositFormResult {
  bytes: Buffer
  filename: string
  /** Things the treasurer should look at before sending it. */
  warnings: string[]
}

/** The rate OSL's own formulas hard-code: gross/109*9. */
const FORM_GST_BASIS_POINTS = 900

/** The template's first breakdown row, and how many it ships with. */
const FIRST_LINE_ROW = 17
const TEMPLATE_LINE_ROWS = 3

/** Styles carried from the template's own cellXfs. */
const STYLE = {
  /** Underlined field, as B4 uses. */
  field: 12,
  /** Bordered text. */
  boxed: 7,
  /** Bordered currency, numFmt 164. */
  money: 10,
  /** Bordered and centred. */
  centred: 20,
} as const

export async function buildDepositForm(
  input: DepositFormInput
): Promise<DepositFormResult> {
  const warnings: string[] = []

  if (input.lines.length === 0) {
    throw new Error('A deposit form with no breakdown states nothing that was collected.')
  }

  if (input.gstBasisPoints !== FORM_GST_BASIS_POINTS) {
    warnings.push(
      `This club is set to ${(input.gstBasisPoints / 100).toFixed(2)}% GST, but OSL's form computes it as 9% in its own cells. The breakdown and the total are right; the two GST lines will read as 9%. Tell OSL before you send it.`
    )
  }

  if (!input.referenceNumber) {
    warnings.push('No reference number has been allocated, so the form goes out with OSL’s blank in section A.')
  }

  if (!input.submittedBy.studentId) {
    warnings.push('No student ID on your profile, so section H leaves it blank for you to write in.')
  }

  const zip = await JSZip.loadAsync(depositFormTemplate())
  const sheetFile = zip.file('xl/worksheets/sheet1.xml')
  if (!sheetFile) throw new Error('The deposit form template is missing its worksheet.')

  const sheet = new Sheet(await sheetFile.async('string'))

  // Make room before writing anything, so every reference below is computed
  // against the final layout rather than the template's.
  const extraRows = Math.max(0, input.lines.length - TEMPLATE_LINE_ROWS)
  if (extraRows > 0) {
    sheet.insertRows(FIRST_LINE_ROW + TEMPLATE_LINE_ROWS, extraRows)
  }

  const lastLineRow = FIRST_LINE_ROW + input.lines.length - 1
  const totalRow = FIRST_LINE_ROW + TEMPLATE_LINE_ROWS + extraRows

  sheet.set([
    { ref: 'B4', value: input.referenceNumber ?? '', style: STYLE.field },
    { ref: 'B5', value: input.organisationName, style: STYLE.field },
    { ref: 'B6', value: input.eventName, style: STYLE.field },
    { ref: 'B7', value: input.eventDate, style: STYLE.field },
    { ref: 'B8', value: input.description, style: STYLE.field },
    { ref: 'C11', value: input.wbsElement },
  ])

  for (const [index, line] of input.lines.entries()) {
    const row = FIRST_LINE_ROW + index
    sheet.set([
      { ref: `A${row}`, value: line.description, style: STYLE.boxed },
      { ref: `B${row}`, value: line.unitPriceCents / 100, style: STYLE.money },
      { ref: `C${row}`, value: line.quantity, style: STYLE.centred },
    ])
    // Rows the template did not ship with have no sub-total formula of their
    // own. Rows it did keep theirs, which insertRows has already moved.
    if (index >= TEMPLATE_LINE_ROWS) {
      sheet.setFormula(`D${row}`, `B${row}*C${row}`)
    }
  }

  // Unused template rows would otherwise sit inside the total's range with a
  // stale =B19*C19 in them. Harmless arithmetically, puzzling on paper.
  sheet.setFormula(`D${totalRow}`, `SUM(D${FIRST_LINE_ROW}:D${lastLineRow})`)

  const submittedRow = totalRow + 4
  sheet.set([
    { ref: `B${submittedRow}`, value: input.submittedBy.name, style: STYLE.boxed },
    { ref: `B${submittedRow + 1}`, value: input.submittedBy.studentId ?? '', style: STYLE.boxed },
    { ref: `B${submittedRow + 2}`, value: input.submittedBy.designation, style: STYLE.boxed },
  ])

  sheet.dropCachedValues()

  zip.file('xl/worksheets/sheet1.xml', sheet.toString())

  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  return { bytes, filename: filenameFor(input), warnings }
}

function filenameFor(input: DepositFormInput): string {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9]+/g, ' ').trim()
  const parts = ['Income Deposit Form', safe(input.organisationName), safe(input.eventName)]
  if (input.referenceNumber) parts.push(input.referenceNumber)
  return `${parts.filter(Boolean).join(' - ')}.xlsx`
}
