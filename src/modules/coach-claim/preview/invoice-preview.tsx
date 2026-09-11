/**
 * The invoice, on screen.
 *
 * Same input as the .docx builder, laid out the same way, because a preview
 * that differs from the file is worse than no preview: it invites somebody to
 * approve one document and send another. `renders the same facts as the .docx`
 * in the tests holds the two together.
 */
import type { InvoiceDocData } from '../types'
import { DEFAULT_VERIFYING_OFFICE } from '../types'
import { formatSgd, formatHours } from '../money'
import { MONTHS, longDate, shortDate } from '../theme'
import { Paper, Eyebrow, Fact, Hairline, PAPER, SignatureStamp } from './paper'

export function InvoicePreview({ data }: { data: InvoiceDocData }) {
  const { instructor } = data
  const period = `${MONTHS[data.periodMonth - 1]} ${data.periodYear}`
  const endorsed = data.endorsement

  return (
    <Paper>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="m-0 font-semibold" style={{ fontSize: 20 }}>
            {instructor.fullName}
          </p>
          <div className="mt-1" style={{ color: PAPER.inkSoft, fontSize: 11 }}>
            {instructor.addressLines.map((l, i) => (
              <p className="m-0" key={i}>
                {l}
              </p>
            ))}
            {instructor.phone && <p className="m-0">{instructor.phone}</p>}
            {instructor.email && <p className="m-0">{instructor.email}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className="m-0 mb-2 font-semibold uppercase"
            style={{ fontSize: 16, letterSpacing: '.1em' }}
          >
            Invoice
          </p>
          <Fact label="Invoice no" value={data.documentNo} align="right" />
          <Fact label="Date" value={longDate(data.invoiceDate)} align="right" />
          <Fact label="Reference" value={data.referenceNumber} align="right" />
        </div>
      </div>

      <Hairline className="my-4" />

      <div className="flex items-start justify-between gap-6">
        <div>
          <Eyebrow>Billed to</Eyebrow>
          <p className="m-0 font-semibold">{data.billTo.name}</p>
          <div style={{ color: PAPER.inkSoft, fontSize: 11 }}>
            {data.billTo.addressLines.map((l, i) => (
              <p className="m-0" key={i}>
                {l}
              </p>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Eyebrow>For</Eyebrow>
          <p className="m-0 font-semibold">{instructor.danceStyle} classes</p>
          <p className="m-0" style={{ color: PAPER.inkSoft, fontSize: 11 }}>
            {period}
          </p>
          <p className="m-0" style={{ color: PAPER.inkSoft, fontSize: 11 }}>
            {data.institutionShortName
              ? `${data.organisationName}, ${data.institutionShortName}`
              : data.organisationName}
          </p>
        </div>
      </div>

      <table
        className="mt-6 w-full border-collapse"
        style={{ fontSize: 11 }}
      >
        <thead>
          <tr style={{ background: PAPER.headerFill, color: PAPER.inkSoft }}>
            <Th>#</Th>
            <Th>Date</Th>
            <Th>Description</Th>
            <Th right>Hours</Th>
            <Th right>Rate</Th>
            <Th right>Amount</Th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <Td muted>{i + 1}</Td>
              <Td>{shortDate(l.heldOn)}</Td>
              <Td>{instructor.danceStyle} class</Td>
              <Td right>{formatHours(l.durationMinutes)}</Td>
              <Td right>{formatSgd(l.hourlyRateCents)}</Td>
              <Td right>{formatSgd(l.amountCents)}</Td>
            </tr>
          ))}
          {data.gstCents > 0 && (
            <>
              <TotalRow label="Subtotal" value={formatSgd(data.subtotalCents)} />
              <TotalRow label="GST" value={formatSgd(data.gstCents)} />
            </>
          )}
          <TotalRow label="Total due" value={formatSgd(data.totalCents)} bold />
        </tbody>
      </table>

      <div className="mt-10 flex items-start justify-between gap-8">
        <div style={{ width: '56%' }}>
          <Eyebrow>Payment to</Eyebrow>
          <p className="m-0 font-semibold">{instructor.fullName}</p>
          <p className="m-0 tabular-nums" style={{ color: PAPER.inkSoft, fontSize: 11 }}>
            {instructor.bankName}&nbsp;&nbsp;{instructor.bankAccountNo}
          </p>
        </div>
        <div style={{ width: '44%' }}>
          <Eyebrow>Student organisation endorsement</Eyebrow>
          <Fact
            label="Intended fund"
            value={`${data.fundSource === 'SEED' ? 'Seed' : 'Income'} Fund`}
          />
          <Fact label="Reference" value={data.referenceNumber} />
          <div className="mt-2">
            <SignatureStamp signature={endorsed?.signatureImage} name={data.treasurerName} />
          </div>
          <Hairline className="mb-1" />
          <p className="m-0 font-semibold" style={{ fontSize: 11 }}>
            {data.treasurerName}
          </p>
          <p className="m-0" style={{ color: PAPER.inkSoft, fontSize: 9.5 }}>
            {endorsed?.office ?? DEFAULT_VERIFYING_OFFICE}, {data.organisationName}
          </p>
          {endorsed?.signedOn && (
            <p className="m-0" style={{ color: PAPER.inkSoft, fontSize: 9.5 }}>
              {longDate(endorsed.signedOn)}
            </p>
          )}
        </div>
      </div>
    </Paper>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className="font-semibold uppercase"
      style={{
        fontSize: 9,
        letterSpacing: '.1em',
        textAlign: right ? 'right' : 'left',
        padding: '6px 8px',
        borderBottom: `1px solid ${PAPER.rule}`,
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  right,
  muted,
  bold,
}: {
  children?: React.ReactNode
  right?: boolean
  muted?: boolean
  bold?: boolean
}) {
  return (
    <td
      className={bold ? 'font-semibold tabular-nums' : 'tabular-nums'}
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '6px 8px',
        borderBottom: `1px solid ${PAPER.rule}`,
        color: muted ? PAPER.inkSoft : undefined,
      }}
    >
      {children}
    </td>
  )
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <Td />
      <Td />
      <Td />
      <Td />
      <Td right bold={bold}>
        {label}
      </Td>
      <Td right bold={bold}>
        {value}
      </Td>
    </tr>
  )
}
