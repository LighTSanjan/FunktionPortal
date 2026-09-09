/**
 * The coach's invoice.
 *
 * Issued BY the instructor and billed to the university (Finance Guidelines
 * §3.1.2, §3.3). The club is not the issuer — it countersigns, records the
 * reference number in the top right corner, and forwards to OSL. That is why
 * this document carries the instructor's masthead and no club branding:
 * a club letterhead here would misstate who is billing SUTD on a document
 * the Office of Finance pays against.
 *
 * Rebuilt from the two templates in Drive, which had drifted apart into one
 * .docx and one .xlsx and acquired separate faults. Three are fixed here:
 *
 *   1. Jin's template's column headers were shifted one place left of the
 *      data, so descriptions sat under "Hours" and rates under "Description".
 *   2. Both collapsed the payee block into the treasurer's countersignature,
 *      so the document read as though the treasurer were the coach.
 *   3. Both hardcoded four lesson rows. Months do not reliably have four.
 */
import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, BorderStyle, VerticalAlign, Packer,
} from 'docx'
import type { InvoiceDocData } from './types'
import { formatSgd, formatHours } from './money'
import { FONT, SIZE, INK, INK_SOFT, RULE, HEADER_FILL, MONTHS, longDate, shortDate } from './theme'

const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const HAIRLINE = { style: BorderStyle.SINGLE, size: 4, color: RULE } as const

function text(value: string, opts: { size?: number; bold?: boolean; color?: string; caps?: boolean } = {}) {
  return new TextRun({
    text: value,
    font: FONT,
    size: opts.size ?? SIZE.body,
    bold: opts.bold,
    color: opts.color ?? INK,
    allCaps: opts.caps,
    characterSpacing: opts.caps ? 20 : undefined,
  })
}

function line(value: string, opts: Parameters<typeof text>[1] & { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spaceAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.spaceAfter ?? 0 },
    children: [text(value, opts)],
  })
}

/** A borderless cell, which is how every layout block here is built. */
function cell(children: Paragraph[], opts: { width?: number; align?: typeof VerticalAlign.TOP } = {}) {
  return new TableCell({
    children,
    borders: NO_BORDERS,
    verticalAlign: opts.align ?? VerticalAlign.TOP,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  })
}

function layoutRow(left: Paragraph[], right: Paragraph[], leftWidth = 58) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [cell(left, { width: leftWidth }), cell(right, { width: 100 - leftWidth })] })],
  })
}

function labelled(label: string, value: string) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 20 },
    children: [text(`${label}:  `, { size: SIZE.small, color: INK_SOFT }), text(value, { size: SIZE.small, bold: true })],
  })
}

function rule() {
  return new Paragraph({ spacing: { before: 140, after: 140 }, border: { bottom: HAIRLINE }, children: [] })
}

function tableCell(children: Paragraph[], opts: { fill?: string; width?: number } = {}) {
  return new TableCell({
    children,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    borders: { top: NONE, bottom: HAIRLINE, left: NONE, right: NONE },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 70, bottom: 70, left: 80, right: 80 },
  })
}

export function buildInvoice(data: InvoiceDocData): Document {
  const { instructor, lines } = data
  const period = `${MONTHS[data.periodMonth - 1]} ${data.periodYear}`

  const masthead = layoutRow(
    [
      line(instructor.fullName, { size: SIZE.masthead, bold: true, spaceAfter: 60 }),
      ...instructor.addressLines.map((l) => line(l, { size: SIZE.small, color: INK_SOFT })),
      ...(instructor.phone ? [line(instructor.phone, { size: SIZE.small, color: INK_SOFT })] : []),
      ...(instructor.email ? [line(instructor.email, { size: SIZE.small, color: INK_SOFT })] : []),
    ],
    [
      line('Invoice', { size: SIZE.title, bold: true, caps: true, align: AlignmentType.RIGHT, spaceAfter: 100 }),
      labelled('Invoice no', data.documentNo),
      labelled('Date', longDate(data.invoiceDate)),
      labelled('Reference', data.referenceNumber),
    ],
  )

  const billTo = layoutRow(
    [
      line('Billed to', { size: SIZE.tiny, caps: true, color: INK_SOFT, spaceAfter: 50 }),
      line(data.billTo.name, { bold: true }),
      ...data.billTo.addressLines.map((l) => line(l, { size: SIZE.small, color: INK_SOFT })),
    ],
    [
      line('For', { size: SIZE.tiny, caps: true, color: INK_SOFT, spaceAfter: 50, align: AlignmentType.RIGHT }),
      line(`${instructor.danceStyle} classes`, { bold: true, align: AlignmentType.RIGHT }),
      line(period, { size: SIZE.small, color: INK_SOFT, align: AlignmentType.RIGHT }),
      line(`${data.organisationName}, SUTD`, { size: SIZE.small, color: INK_SOFT, align: AlignmentType.RIGHT }),
    ],
  )

  const head = (label: string, align?: (typeof AlignmentType)[keyof typeof AlignmentType], width?: number) =>
    tableCell([line(label, { size: SIZE.tiny, caps: true, color: INK_SOFT, align })], { fill: HEADER_FILL, width })

  const COLS = [6, 14, 42, 10, 14, 14] as const

  const itemRows = lines.map((l, i) =>
    new TableRow({
      children: [
        tableCell([line(String(i + 1), { size: SIZE.small, color: INK_SOFT })], { width: COLS[0] }),
        tableCell([line(shortDate(l.heldOn), { size: SIZE.small })], { width: COLS[1] }),
        tableCell([line(`${instructor.danceStyle} class`, { size: SIZE.small })], { width: COLS[2] }),
        tableCell([line(formatHours(l.durationMinutes), { size: SIZE.small, align: AlignmentType.RIGHT })], { width: COLS[3] }),
        tableCell([line(formatSgd(l.hourlyRateCents), { size: SIZE.small, align: AlignmentType.RIGHT })], { width: COLS[4] }),
        tableCell([line(formatSgd(l.amountCents), { size: SIZE.small, align: AlignmentType.RIGHT })], { width: COLS[5] }),
      ],
    }),
  )

  const totalRow = (label: string, value: string, bold: boolean) =>
    new TableRow({
      children: [
        tableCell([], { width: COLS[0] }),
        tableCell([], { width: COLS[1] }),
        tableCell([], { width: COLS[2] }),
        tableCell([], { width: COLS[3] }),
        tableCell([line(label, { size: SIZE.small, bold, align: AlignmentType.RIGHT })], { width: COLS[4] }),
        tableCell([line(value, { size: SIZE.small, bold, align: AlignmentType.RIGHT })], { width: COLS[5] }),
      ],
    })

  const items = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: HAIRLINE, insideVertical: NONE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          head('#', undefined, COLS[0]),
          head('Date', undefined, COLS[1]),
          head('Description', undefined, COLS[2]),
          head('Hours', AlignmentType.RIGHT, COLS[3]),
          head('Rate', AlignmentType.RIGHT, COLS[4]),
          head('Amount', AlignmentType.RIGHT, COLS[5]),
        ],
      }),
      ...itemRows,
      ...(data.gstCents > 0
        ? [totalRow('Subtotal', formatSgd(data.subtotalCents), false), totalRow('GST', formatSgd(data.gstCents), false)]
        : []),
      totalRow('Total due', formatSgd(data.totalCents), true),
    ],
  })

  // Payee and countersignature are two different people making two different
  // statements, so they are two visibly separate blocks. In the templates
  // they had run together into one, which read as though the treasurer were
  // the coach.
  const payment = [
    line('Payment to', { size: SIZE.tiny, caps: true, color: INK_SOFT, spaceAfter: 50 }),
    line(instructor.fullName, { bold: true }),
    line(`${instructor.bankName}  ${instructor.bankAccountNo}`, { size: SIZE.small, color: INK_SOFT }),
  ]

  const endorsement = [
    line('Student organisation endorsement', { size: SIZE.tiny, caps: true, color: INK_SOFT, spaceAfter: 50 }),
    new Paragraph({
      spacing: { after: 20 },
      children: [text('Intended fund:  ', { size: SIZE.small, color: INK_SOFT }),
                 text(`${data.fundSource === 'SEED' ? 'Seed' : 'Income'} Fund`, { size: SIZE.small, bold: true })],
    }),
    new Paragraph({
      spacing: { after: 260 },
      children: [text('Reference:  ', { size: SIZE.small, color: INK_SOFT }), text(data.referenceNumber, { size: SIZE.small, bold: true })],
    }),
    new Paragraph({ border: { bottom: HAIRLINE }, spacing: { after: 40 }, children: [] }),
    line(data.treasurerName, { size: SIZE.small, bold: true }),
    line(`Treasurer, ${data.organisationName}`, { size: SIZE.tiny, color: INK_SOFT }),
  ]

  return new Document({
    creator: instructor.fullName,
    title: `Invoice ${data.documentNo}`,
    description: `${instructor.danceStyle} classes, ${period}`,
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 900, left: 1000, right: 1000 } } },
        children: [
          masthead,
          rule(),
          billTo,
          new Paragraph({ spacing: { after: 260 }, children: [] }),
          items,
          new Paragraph({ spacing: { after: 420 }, children: [] }),
          layoutRow(payment, endorsement, 56),
        ],
      },
    ],
  })
}

export async function renderInvoice(data: InvoiceDocData): Promise<Buffer> {
  return Packer.toBuffer(buildInvoice(data))
}

/** "JIN15092026" — the issuer's own numbering, distinct from the OSL reference. */
export function instructorDocumentNo(shortCode: string, invoiceDate: Date): string {
  const dd = String(invoiceDate.getDate()).padStart(2, '0')
  const mm = String(invoiceDate.getMonth() + 1).padStart(2, '0')
  return `${shortCode.toUpperCase()}${dd}${mm}${invoiceDate.getFullYear()}`
}
