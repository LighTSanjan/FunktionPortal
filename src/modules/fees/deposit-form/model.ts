/**
 * The Income Deposit Form as data, once — read by both renderers.
 *
 * There are two: the .xlsx that goes to OSL, and the print view that produces
 * the PDF. Two renderers over two calculations agree by inspection until the
 * day they do not, so they share this and a test compares what they produce.
 *
 * The arithmetic here is OSL's, not ours. Their sheet computes
 * gross/109*100 and gross/109*9 in its own cells and rounds each for display,
 * so that is what this does — even where the portal's own splitGst, which
 * divides and takes the remainder, would put a stray cent somewhere else. A
 * PDF that disagrees with the workbook it accompanies is worse than a PDF
 * that rounds the way the recipient's own template does.
 */

export interface DepositLineView {
  description: string
  unitPrice: string
  quantity: number
  subtotal: string
}

export interface DepositFormModel {
  reference: string
  organisationName: string
  eventName: string
  eventDate: string
  description: string
  wbsElement: string
  lines: DepositLineView[]
  /** (a) */
  netOfGst: string
  /** (b) */
  gst: string
  /** (c) = (a) + (b) */
  totalWithGst: string
  /** The Breakdown table's own total, which (c) is derived from. */
  breakdownTotal: string
  submittedBy: { name: string; studentId: string; designation: string }
}

/** The divisor and numerator OSL's own cells carry. */
const GST_DIVISOR = 109
const GST_NUMERATOR = 9

export interface ModelInput {
  referenceNumber: string | null
  organisationName: string
  eventName: string
  eventDate: string
  description: string
  wbsElement: string
  lines: readonly { description: string; unitPriceCents: number; quantity: number }[]
  submittedBy: { name: string; studentId: string | null; designation: string }
}

export function depositFormModel(input: ModelInput): DepositFormModel {
  const lines = input.lines.map((line) => ({
    description: line.description,
    unitPrice: money(line.unitPriceCents / 100),
    quantity: line.quantity,
    subtotal: money((line.unitPriceCents * line.quantity) / 100),
  }))

  const gross = input.lines.reduce(
    (sum, line) => sum + (line.unitPriceCents * line.quantity) / 100,
    0
  )
  const net = (gross / GST_DIVISOR) * 100
  const gst = (gross / GST_DIVISOR) * GST_NUMERATOR

  return {
    // Blank rather than invented. OSL's own template prints a rule here.
    reference: input.referenceNumber ?? '',
    organisationName: input.organisationName,
    eventName: input.eventName,
    eventDate: input.eventDate,
    description: input.description,
    wbsElement: input.wbsElement,
    lines,
    netOfGst: money(net),
    gst: money(gst),
    // The sheet's (c) is SUM(B11:B12) over the unrounded cells, so it is the
    // gross — not the two rounded halves added back together, which can be a
    // cent adrift.
    totalWithGst: money(net + gst),
    breakdownTotal: money(gross),
    submittedBy: {
      name: input.submittedBy.name,
      studentId: input.submittedBy.studentId ?? '',
      designation: input.submittedBy.designation,
    },
  }
}

/** The template's own number format: _("$"* #,##0.00_). */
export function money(amount: number): string {
  return `$${amount.toLocaleString('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** The static text OSL's sheet carries, so both renderers print it identically. */
export const FORM_LABELS = {
  organisation: 'SUTD Student Organisation',
  title: 'DBS Max Income Deposit Form (as at Apr 2022)',
  reference: 'A. Finance Reference No.:',
  studentOrganisation: 'B. Student Organisation:',
  eventName: 'C. Name of Event/Project:',
  eventDate: 'D. Date of Event/Project:',
  description: 'E. Description of Income:',
  amountReceived: 'F. Amount Received',
  currency: '(S$)',
  wbsElement: 'WBS element',
  glAccount: 'GL Account',
  note: 'Note',
  netRow: '(a) Amount w/o GST',
  gstRow: '(b) GST',
  totalRow: '(c) Total amount with GST\n       (c) = (a) + (b)',
  netGl: '80403001',
  gstGl: '30203003',
  netNote: 'Amount w/o GST = GST inclusive amount/109*100',
  gstNote: 'GST amount = GST inclusive amount/109*9',
  breakdown: 'Breakdown:',
  itemHeader: 'Description of\nItem / Good / Services ',
  priceHeader: 'Price (inc. GST) ',
  quantityHeader: 'Quantity ',
  subtotalHeader: 'Sub-total (inc. GST)',
  breakdownTotal: 'Total (inc. GST)',
  submittedBy: 'H. Submitted by:',
  name: 'Name:',
  studentId: 'Student ID:',
  designation: 'Designation:',
} as const
