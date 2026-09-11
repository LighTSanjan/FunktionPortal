/** Build the club's monthly member-by-date attendance document. */
import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, BorderStyle, VerticalAlign, ImageRun, PageOrientation, Packer,
  type ITableCellOptions,
} from 'docx'
import type { AttendanceSheetDocData, ClaimLine } from './types'
import { signatureBlock } from './signature-block'
import { DEFAULT_VERIFYING_OFFICE } from './types'
import { formatSgd, formatHours } from './money'
import { FONT, SIZE, INK, INK_SOFT, RULE, HEADER_FILL, FALLBACK_BAND_COLORS, MONTHS, shortDate, longDate } from './theme'

const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const HAIRLINE = { style: BorderStyle.SINGLE, size: 4, color: RULE } as const

/** The instructor row, tinted so the self-practice dates read at a glance. */
const INSTRUCTOR_FILL = 'FCEBD2'

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
  return new Paragraph({ alignment: opts.align, spacing: { after: opts.spaceAfter ?? 0 }, children: [text(value, opts)] })
}

function cell(children: Paragraph[], width?: number, valign: ITableCellOptions['verticalAlign'] = VerticalAlign.TOP) {
  return new TableCell({
    children, borders: NO_BORDERS, verticalAlign: valign,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  })
}

function bandedRule(colours: string[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        height: { value: 90, rule: 'exact' },
        children: colours.map((colour) =>
          new TableCell({
            children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })],
            shading: { fill: colour },
            borders: NO_BORDERS,
            width: { size: 100 / colours.length, type: WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        ),
      }),
    ],
  })
}

function gridCell(children: Paragraph[], opts: { fill?: string; width?: number } = {}) {
  return new TableCell({
    children,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    borders: { top: NONE, bottom: HAIRLINE, left: NONE, right: NONE },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
    verticalAlign: VerticalAlign.CENTER,
  })
}

function fact(label: string, value: string, align?: (typeof AlignmentType)[keyof typeof AlignmentType]) {
  return new Paragraph({
    alignment: align,
    spacing: { after: 30 },
    children: [text(`${label}:  `, { size: SIZE.small, color: INK_SOFT }), text(value, { size: SIZE.small, bold: true })],
  })
}

/** Summarise uniform sessions; list hours when durations or rates differ. */
function claimWorking(lines: ClaimLine[]): string | null {
  if (lines.length === 0) return null

  const durations = new Set(lines.map((l) => l.durationMinutes))
  const rates = new Set(lines.map((l) => l.hourlyRateCents))

  // One multiplication only holds when every session ran the same length at
  // the same rate. Where either differs — a three-hour workshop, or a month
  // straddling a rate rise — stating one would be a lie, so the sessions are
  // listed instead.
  if (durations.size === 1 && rates.size === 1) {
    const hours = formatHours(lines[0].durationMinutes)
    return `${formatSgd(lines[0].hourlyRateCents)}/hr x ${lines.length} ${lines.length === 1 ? 'session' : 'sessions'} x ${hours} hr/session`
  }
  return lines
    .map((l) => `${formatHours(l.durationMinutes)} hr @ ${formatSgd(l.hourlyRateCents)}/hr`)
    .join('  +  ')
}

export function buildAttendanceSheet(data: AttendanceSheetDocData): Document {
  const { instructor, sessions, roster } = data
  const period = `${MONTHS[data.periodMonth - 1]} ${data.periodYear}`.toUpperCase()
  const branding = data.branding ?? {}
  const logo = branding.logo
  const bands = branding.bandColors?.length ? branding.bandColors : FALLBACK_BAND_COLORS

  // A month with more than five class dates stops fitting across a portrait
  // page once the names have room to breathe.
  const landscape = sessions.length > 5

  const title = [
    line('Coaches Monthly Attendance Sheet', { size: SIZE.masthead, bold: true, spaceAfter: 40 }),
    ...(branding.tagline ? [line(branding.tagline, { size: SIZE.small, color: INK_SOFT })] : []),
  ]

  const mark = logo
    ? [new Paragraph({
        children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 92, height: 92 } })],
      })]
    : [line(data.organisationName, { size: SIZE.masthead, bold: true })]

  const masthead = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        children: [cell(mark, 14), cell(title, 86, VerticalAlign.CENTER)],
      }),
    ],
  })

  const details = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        children: [
          cell([fact('Club name', data.organisationName), fact('Month', period)], 45),
          cell([
            fact('Coach', `${instructor.fullName} — ${instructor.danceStyle}`, AlignmentType.RIGHT),
            ...(data.referenceNumber ? [fact('Reference', data.referenceNumber, AlignmentType.RIGHT)] : []),
          ], 55),
        ],
      }),
    ],
  })

  // Names need the most room; the date columns share what is left.
  const NAME_COL = landscape ? 22 : 30
  const dateCol = (100 - NAME_COL) / Math.max(sessions.length, 1)

  const mark_ = (present: boolean) =>
    line(present ? 'YES' : 'NO', {
      size: SIZE.tiny,
      align: AlignmentType.CENTER,
      color: present ? INK : INK_SOFT,
      bold: present,
    })

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      gridCell([line('Name', { size: SIZE.tiny, caps: true, color: INK_SOFT })], { fill: HEADER_FILL, width: NAME_COL }),
      ...sessions.map((s) =>
        gridCell(
          [
            line(shortDate(s.heldOn), { size: SIZE.tiny, caps: true, color: INK_SOFT, align: AlignmentType.CENTER }),
            line(`${formatHours(s.durationMinutes)} hr`, { size: SIZE.tiny, color: INK_SOFT, align: AlignmentType.CENTER }),
          ],
          { fill: HEADER_FILL, width: dateCol },
        ),
      ),
    ],
  })

  // The instructor's own row. Where it reads NO, the club met without a
  // coach and that date is not on the invoice.
  const instructorRow = new TableRow({
    children: [
      gridCell([line(instructor.fullName, { size: SIZE.tiny, bold: true })], { fill: INSTRUCTOR_FILL, width: NAME_COL }),
      ...sessions.map((s) => gridCell([mark_(s.instructorPresent)], { fill: INSTRUCTOR_FILL, width: dateCol })),
    ],
  })

  const memberRows = roster.map((m, i) =>
    new TableRow({
      children: [
        gridCell([
          new Paragraph({
            children: [text(`${i + 1}.  `, { size: SIZE.tiny, color: INK_SOFT }), text(m.fullName, { size: SIZE.tiny })],
          }),
        ], { width: NAME_COL }),
        ...sessions.map((s) => gridCell([mark_(s.presentMemberIds.has(m.id))], { width: dateCol })),
      ],
    }),
  )

  const totalRow = new TableRow({
    children: [
      gridCell([line('Total pax present', { size: SIZE.tiny, bold: true })], { fill: HEADER_FILL, width: NAME_COL }),
      ...sessions.map((s) =>
        gridCell([line(String(s.presentCount), { size: SIZE.tiny, bold: true, align: AlignmentType.CENTER })], {
          fill: HEADER_FILL,
          width: dateCol,
        }),
      ),
    ],
  })

  const matrix = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: HAIRLINE, insideVertical: NONE },
    rows: [headerRow, instructorRow, ...memberRows, totalRow],
  })

  const working = claimWorking(data.lines)

  const claim = new Paragraph({
    spacing: { before: 300, after: 60 },
    children: [
      text('Total coach claim:  ', { size: SIZE.small, color: INK_SOFT }),
      text(formatSgd(data.claimTotalCents), { size: SIZE.small, bold: true }),
      ...(working ? [text(`   (${working})`, { size: SIZE.small, color: INK_SOFT })] : []),
    ],
  })

  const notes: Paragraph[] = []
  if (data.clubFundBalanceCents !== undefined) {
    notes.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          text('Balance of Club Fund:  ', { size: SIZE.small, color: INK_SOFT }),
          text(formatSgd(data.clubFundBalanceCents), { size: SIZE.small, bold: true }),
        ],
      }),
    )
  }
  notes.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        text('Intended fund:  ', { size: SIZE.small, color: INK_SOFT }),
        text(`${data.fundSource === 'SEED' ? 'Seed' : 'Income'} Fund`, { size: SIZE.small, bold: true }),
      ],
    }),
  )

  const v = data.verification
  const endorsement = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        children: [
          cell([
            line('Verified by', { size: SIZE.tiny, caps: true, color: INK_SOFT, spaceAfter: 60 }),
            ...signatureBlock(v?.signatureImage, 280),
            new Paragraph({ border: { bottom: HAIRLINE }, spacing: { after: 60 }, children: [] }),
            line('Signature', { size: SIZE.tiny, color: INK_SOFT, spaceAfter: 90 }),
            fact('Name', v?.name ?? ''),
            fact('Office', v?.office ?? DEFAULT_VERIFYING_OFFICE),
            ...(v?.studentId ? [fact('Student ID', v.studentId)] : []),
            fact('Date', v?.signedOn ? longDate(v.signedOn) : ''),
          ], 52),
          cell([new Paragraph({ children: [] })], 48),
        ],
      }),
    ],
  })

  return new Document({
    creator: data.organisationName,
    title: `Attendance sheet — ${instructor.fullName}, ${period}`,
    sections: [
      {
        properties: {
          page: {
            size: landscape ? { orientation: PageOrientation.LANDSCAPE } : undefined,
            margin: { top: 900, bottom: 800, left: 900, right: 900 },
          },
        },
        children: [
          masthead,
          new Paragraph({ spacing: { after: 140 }, children: [] }),
          bandedRule(bands),
          new Paragraph({ spacing: { after: 260 }, children: [] }),
          details,
          new Paragraph({ spacing: { after: 260 }, children: [] }),
          matrix,
          claim,
          ...notes,
          new Paragraph({ spacing: { after: 340 }, children: [] }),
          endorsement,
        ],
      },
    ],
  })
}

export async function renderAttendanceSheet(data: AttendanceSheetDocData): Promise<Buffer> {
  return Packer.toBuffer(buildAttendanceSheet(data))
}
