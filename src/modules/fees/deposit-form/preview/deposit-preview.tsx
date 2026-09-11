/**
 * The deposit form, laid out to print.
 *
 * Deliberately a rendering of the workbook rather than a redesign of it: the
 * same rows in the same order with the same borders, because the recipient
 * has been reading that layout for years and a prettier one is a form they
 * have to learn. What it adds over Excel's own print output is the club's
 * mark in the corner and type that was chosen rather than defaulted.
 *
 * Not themed. It is a sheet of paper, and the Office of Finance will never
 * see it in dark mode.
 */
import type { DepositFormModel } from '../model'
import { FORM_LABELS } from '../model'

const INK = '#1B1B1F'
const RULE = '#9A9AA0'
const SOFT = '#5C5C66'

/**
 * The template's own column widths, in Excel's character units — with column
 * A given a little more room.
 *
 * Excel calibrates those units to Calibri 11. The web has no guarantee of
 * Calibri, and in the fallback the longest label, "A. Finance Reference No.:",
 * is a hair too wide for 24.66 and wraps to two lines, which makes the first
 * row taller than every other and reads as a different form. Widening A is an
 * adaptation to a different typesetter, not a change to the layout.
 */
const COLUMNS = [28, 17.66, 26.66, 18.33] as const

/**
 * Column E carries OSL's explanatory notes. In the sheet it is the default
 * width and the text simply runs on across the empty cells beside it; on a
 * page there is nothing to run into, so it gets a share of its own.
 */
const NOTE_COLUMN = 30

/**
 * One grid for every block on the sheet.
 *
 * Columns belong to the worksheet, not to a table — A is the same width in
 * the header block, the amounts block and the breakdown, because in Excel it
 * is literally the same column. Giving each block its own proportions made
 * the three ruled boxes end at three different places down the page, which is
 * the first thing that reads as "not the form they know".
 */
const GRID = (() => {
  const all = [...COLUMNS, NOTE_COLUMN]
  const total = all.reduce((sum, width) => sum + width, 0)
  return all.map((width, index) => ({ key: index, width: `${(width / total) * 100}%` }))
})()

function Columns() {
  return (
    <colgroup>
      {GRID.map((column) => (
        <col key={column.key} style={{ width: column.width }} />
      ))}
    </colgroup>
  )
}

/**
 * Fixed layout, so the column widths above are authoritative rather than
 * advisory. Under auto layout the browser resizes columns to fit content, and
 * the three blocks — which hold different content in the same columns — stop
 * lining up with one another.
 */
const TABLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
}

export function DepositFormPreview({
  model,
  logoUrl,
}: {
  model: DepositFormModel
  /** The club's mark, top right. Absent on a club that has not set one. */
  logoUrl?: string | null
}) {
  return (
    <div
      data-print="sheet"
      className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-[var(--sunk,#F1EFEA)] p-3 sm:p-5"
    >
      <div
        className="mx-auto bg-white px-[7%] py-[6%] shadow-[0_1px_2px_rgba(23,25,43,.06),0_12px_36px_-20px_rgba(23,25,43,.45)]"
        style={{
          color: INK,
          fontFamily: 'Calibri, Carlito, "Segoe UI", system-ui, sans-serif',
          width: 820,
          maxWidth: '100%',
          fontSize: 12.5,
          lineHeight: 1.4,
        }}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 font-bold" style={{ fontSize: 14 }}>
              {FORM_LABELS.organisation}
            </p>
            <p className="m-0 mt-0.5" style={{ fontSize: 12.5, color: SOFT }}>
              {FORM_LABELS.title}
            </p>
          </div>
          {logoUrl && (
            /* Decoration, and deliberately wordless: the form's wording is
               OSL's, and a mark that added a line of text would be the two
               renderings starting to disagree.
               eslint-disable-next-line @next/next/no-img-element */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              aria-hidden="true"
              style={{ height: 34, width: 'auto', objectFit: 'contain' }}
            />
          )}
        </header>

        <table style={{ ...TABLE, marginTop: 18 }}>
          <Columns />
          <tbody>
            <Field label={FORM_LABELS.reference} value={model.reference} />
            <Field label={FORM_LABELS.studentOrganisation} value={model.organisationName} />
            <Field label={FORM_LABELS.eventName} value={model.eventName} />
            <Field label={FORM_LABELS.eventDate} value={model.eventDate} />
            <Field label={FORM_LABELS.description} value={model.description} />
          </tbody>
        </table>

        <table style={{ ...TABLE, marginTop: 22 }}>
          <Columns />
          <tbody>
            <tr>
              <Box bold>{FORM_LABELS.amountReceived}</Box>
              <Box bold centre>
                {FORM_LABELS.currency}
              </Box>
              <Box bold>{FORM_LABELS.wbsElement}</Box>
              <Box bold>{FORM_LABELS.glAccount}</Box>
              <Note>{FORM_LABELS.note}</Note>
            </tr>
            <tr>
              <Box bold>{FORM_LABELS.netRow}</Box>
              <Box money>{model.netOfGst}</Box>
              <Box mono>{model.wbsElement}</Box>
              <Box mono>{FORM_LABELS.netGl}</Box>
              <Note>{FORM_LABELS.netNote}</Note>
            </tr>
            <tr>
              <Box bold>{FORM_LABELS.gstRow}</Box>
              <Box money>{model.gst}</Box>
              <Box mono>-</Box>
              <Box mono>{FORM_LABELS.gstGl}</Box>
              <Note>{FORM_LABELS.gstNote}</Note>
            </tr>
            <tr>
              <Box bold wrap>
                {FORM_LABELS.totalRow}
              </Box>
              <Box money>{model.totalWithGst}</Box>
              <Box />
              <Box />
              <Note />
            </tr>
          </tbody>
        </table>

        <p className="m-0 mb-2 mt-7 font-bold" style={{ fontSize: 12.5 }}>
          {FORM_LABELS.breakdown}
        </p>

        <table style={TABLE}>
          <Columns />
          <tbody>
            <tr>
              <Box bold centre wrap>
                {FORM_LABELS.itemHeader}
              </Box>
              <Box bold centre>
                {FORM_LABELS.priceHeader}
              </Box>
              <Box bold centre>
                {FORM_LABELS.quantityHeader}
              </Box>
              <Box bold centre>
                {FORM_LABELS.subtotalHeader}
              </Box>
              <Spacer />
            </tr>
            {model.lines.map((line) => (
              <tr key={`${line.description}-${line.unitPrice}`}>
                <Box>{line.description}</Box>
                <Box money>{line.unitPrice}</Box>
                <Box centre>{String(line.quantity)}</Box>
                <Box money>{line.subtotal}</Box>
                <Spacer />
              </tr>
            ))}
            <tr>
              <Box bold colSpan={3}>
                {FORM_LABELS.breakdownTotal}
              </Box>
              <Box money>{model.breakdownTotal}</Box>
              <Spacer />
            </tr>
          </tbody>
        </table>

        <p className="m-0 mb-2 mt-9 font-bold" style={{ fontSize: 12.5 }}>
          {FORM_LABELS.submittedBy}
        </p>

        <table style={TABLE}>
          <Columns />
          <tbody>
            <Field label={FORM_LABELS.name} value={model.submittedBy.name} boxed />
            <Field label={FORM_LABELS.studentId} value={model.submittedBy.studentId} boxed />
            <Field label={FORM_LABELS.designation} value={model.submittedBy.designation} boxed />
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** A label in column A and its value spanning B through D, as the sheet merges them. */
function Field({
  label,
  value,
  boxed,
}: {
  label: string
  value: string
  /** The Submitted by block is fully ruled; the header block is underlined. */
  boxed?: boolean
}) {
  return (
    <tr>
      <Box bold>{label}</Box>
      <td
        colSpan={3}
        style={{
          border: boxed ? `1px solid ${RULE}` : undefined,
          borderBottom: `1px solid ${RULE}`,
          padding: '5px 7px',
          fontWeight: 600,
          verticalAlign: 'middle',
        }}
      >
        {value || ' '}
      </td>
      <Spacer />
    </tr>
  )
}

function Box({
  children,
  bold,
  centre,
  money,
  mono,
  wrap,
  colSpan,
}: {
  children?: React.ReactNode
  bold?: boolean
  centre?: boolean
  money?: boolean
  mono?: boolean
  wrap?: boolean
  colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        border: `1px solid ${RULE}`,
        padding: '5px 7px',
        fontWeight: bold ? 600 : 400,
        textAlign: centre ? 'center' : money ? 'right' : 'left',
        fontVariantNumeric: money ? 'tabular-nums' : undefined,
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        // The WBS element is 24 characters in a column sized for 26 of
        // Calibri's; a monospace face at the body size overruns it and wraps
        // a reference that reads as one token.
        fontSize: mono ? 10.5 : undefined,
        whiteSpace: wrap ? 'pre-line' : undefined,
        verticalAlign: 'middle',
      }}
    >
      {children ?? ' '}
    </td>
  )
}

/** Column E where the sheet leaves it empty. It holds the grid in step. */
function Spacer() {
  return <td aria-hidden="true" />
}

/** Column E: the sheet's own explanatory notes, outside the ruled grid. */
function Note({ children }: { children?: React.ReactNode }) {
  return (
    <td style={{ padding: '5px 0 5px 10px', fontSize: 10.5, color: SOFT, verticalAlign: 'middle' }}>
      {children ?? ' '}
    </td>
  )
}
