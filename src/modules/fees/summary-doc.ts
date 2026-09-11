/**
 * The term fee summary: who paid, at which tier, how much, confirmed when.
 *
 * The one artefact the club's current process has no equivalent of. Fees have
 * been collected as a lump sum banked in once a term, with no record of who
 * actually paid — so the question "did I pay last term" has only ever been
 * answerable by whoever was treasurer at the time, and only until they
 * graduated.
 *
 * This is the club's own document, not OSL's, which is why it may be designed
 * rather than filled in: the Income Deposit Form is OSL's and carries only the
 * total.
 */
import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, BorderStyle, VerticalAlign, Packer,
} from 'docx'
import { formatSgd } from '@/modules/coach-claim/money'
import {
  FONT, SIZE, INK, INK_SOFT, RULE, HEADER_FILL, FALLBACK_BAND_COLORS, longDate,
} from '@/modules/coach-claim/theme'
import { signatureBlock } from '@/modules/coach-claim/signature-block'
import type { Branding, SignatureImage } from '@/modules/coach-claim/types'

const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const HAIRLINE = { style: BorderStyle.SINGLE, size: 4, color: RULE } as const

export interface SummaryRow {
  memberName: string
  tierLabel: string
  amountCents: number
  /** Confirmed, refused, declared and not yet decided, or nothing at all. */
  statusLabel: string
  confirmedOn?: Date
  /** Money the exco hold outside the OSL accounts. */
  unofficial: boolean
}

export interface FeeSummaryDocData {
  organisationName: string
  termName: string
  rows: SummaryRow[]
  /** Confirmed on the official route — what the deposit form banks in. */
  bankedCents: number
  /** Confirmed off it. Real money, no WBS element to quote. */
  unofficialCents: number
  outstandingCents: number
  /** Present once the collection has been closed. */
  referenceNumber?: string
  finalCollectionAt?: Date
  branding?: Branding
  preparedBy?: { name: string; office: string; signedOn?: Date; signatureImage?: SignatureImage }
}

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

function line(
  value: string,
  opts: Parameters<typeof text>[1] & {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    spaceAfter?: number
  } = {}
) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.spaceAfter ?? 0 },
    children: [text(value, opts)],
  })
}

function fact(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 30 },
    children: [
      text(`${label}:  `, { size: SIZE.small, color: INK_SOFT }),
      text(value, { size: SIZE.small, bold: true }),
    ],
  })
}

function cell(children: Paragraph[], opts: { fill?: string; width?: number } = {}) {
  return new TableCell({
    children,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    borders: { top: NONE, bottom: HAIRLINE, left: NONE, right: NONE },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
    verticalAlign: VerticalAlign.CENTER,
  })
}

function bandedRule(colours: string[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        height: { value: 90, rule: 'exact' },
        children: colours.map(
          (colour) =>
            new TableCell({
              children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })],
              shading: { fill: colour },
              borders: NO_BORDERS,
              width: { size: 100 / colours.length, type: WidthType.PERCENTAGE },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
            })
        ),
      }),
    ],
  })
}

const COLS = [6, 40, 16, 16, 22] as const

/**
 * The status cell, including whether the money went through the OSL accounts.
 *
 * The totals below state an "outside the OSL accounts" figure, and a total
 * that names no rows is a total nobody can check.
 */
export function statusText(row: SummaryRow): string {
  const when = row.confirmedOn ? `${row.statusLabel}, ${longDate(row.confirmedOn)}` : row.statusLabel
  return row.unofficial ? `${when} (outside OSL)` : when
}

export function buildFeeSummary(data: FeeSummaryDocData): Document {
  const bands = data.branding?.bandColors?.length
    ? data.branding.bandColors
    : FALLBACK_BAND_COLORS

  const head = (label: string, align?: (typeof AlignmentType)[keyof typeof AlignmentType], width?: number) =>
    cell([line(label, { size: SIZE.tiny, caps: true, color: INK_SOFT, align })], {
      fill: HEADER_FILL,
      width,
    })

  const rows = data.rows.map(
    (row, index) =>
      new TableRow({
        children: [
          cell([line(String(index + 1), { size: SIZE.tiny, color: INK_SOFT })], { width: COLS[0] }),
          cell([line(row.memberName, { size: SIZE.tiny })], { width: COLS[1] }),
          cell([line(row.tierLabel, { size: SIZE.tiny, color: INK_SOFT })], { width: COLS[2] }),
          cell(
            [line(formatSgd(row.amountCents), { size: SIZE.tiny, align: AlignmentType.RIGHT })],
            { width: COLS[3] }
          ),
          cell([line(statusText(row), { size: SIZE.tiny, color: INK_SOFT })], { width: COLS[4] }),
        ],
      })
  )

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: HAIRLINE, insideVertical: NONE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          head('#', undefined, COLS[0]),
          head('Member', undefined, COLS[1]),
          head('Tier', undefined, COLS[2]),
          head('Amount', AlignmentType.RIGHT, COLS[3]),
          head('Status', undefined, COLS[4]),
        ],
      }),
      ...rows,
    ],
  })

  const totals: Paragraph[] = [
    fact('Banked in through the Income Deposit Form', formatSgd(data.bankedCents)),
  ]
  if (data.unofficialCents > 0) {
    // Real money the club can spend, held outside the OSL accounts. Stated
    // separately because there is no WBS element to quote against it and
    // nothing for OSL to reimburse.
    totals.push(fact('Held outside the OSL accounts', formatSgd(data.unofficialCents)))
  }
  totals.push(fact('Still outstanding', formatSgd(data.outstandingCents)))

  const prepared = data.preparedBy
  const endorsement: Paragraph[] = [
    line('Prepared by', { size: SIZE.tiny, caps: true, color: INK_SOFT, spaceAfter: 60 }),
    ...signatureBlock(prepared?.signatureImage, 240),
    new Paragraph({ border: { bottom: HAIRLINE }, spacing: { after: 40 }, children: [] }),
    line(prepared?.name ?? '', { size: SIZE.small, bold: true }),
    line(prepared ? `${prepared.office}, ${data.organisationName}` : '', {
      size: SIZE.tiny,
      color: INK_SOFT,
    }),
    ...(prepared?.signedOn
      ? [line(longDate(prepared.signedOn), { size: SIZE.tiny, color: INK_SOFT })]
      : []),
  ]

  return new Document({
    creator: data.organisationName,
    title: `Fee summary — ${data.termName}`,
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 800, left: 900, right: 900 } } },
        children: [
          line(data.organisationName, { size: SIZE.masthead, bold: true, spaceAfter: 40 }),
          line('Term subscription summary', { size: SIZE.title, bold: true, spaceAfter: 140 }),
          bandedRule(bands),
          new Paragraph({ spacing: { after: 260 }, children: [] }),
          fact('Term', data.termName),
          ...(data.referenceNumber ? [fact('Deposit reference', data.referenceNumber)] : []),
          ...(data.finalCollectionAt
            ? [fact('Final collection', longDate(data.finalCollectionAt))]
            : []),
          fact('Members', String(data.rows.length)),
          new Paragraph({ spacing: { after: 260 }, children: [] }),
          table,
          new Paragraph({ spacing: { after: 260 }, children: [] }),
          ...totals,
          new Paragraph({ spacing: { after: 340 }, children: [] }),
          ...endorsement,
        ],
      },
    ],
  })
}

export async function renderFeeSummary(data: FeeSummaryDocData): Promise<Buffer> {
  return Packer.toBuffer(buildFeeSummary(data))
}
