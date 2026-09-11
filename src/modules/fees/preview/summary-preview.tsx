/**
 * The term fee summary, on screen. Held to the .docx by the same kind of test
 * as the coach documents: layout may differ, content may not.
 */
import { statusText, type FeeSummaryDocData } from '../summary-doc'
import { formatSgd } from '@/modules/coach-claim/money'
import { FALLBACK_BAND_COLORS, longDate } from '@/modules/coach-claim/theme'
import { Paper, Eyebrow, Fact, Hairline, PAPER, SignatureStamp } from '@/modules/coach-claim/preview/paper'

export function FeeSummaryPreview({ data }: { data: FeeSummaryDocData }) {
  const bands = data.branding?.bandColors?.length ? data.branding.bandColors : FALLBACK_BAND_COLORS
  const prepared = data.preparedBy

  return (
    <Paper>
      <p className="m-0 font-semibold" style={{ fontSize: 20 }}>
        {data.organisationName}
      </p>
      <p className="m-0 mt-1 font-semibold" style={{ fontSize: 16 }}>
        Term subscription summary
      </p>

      <div className="mt-3 flex" style={{ height: 5 }} aria-hidden="true">
        {bands.map((colour, i) => (
          <div key={i} style={{ background: `#${colour}`, width: `${100 / bands.length}%` }} />
        ))}
      </div>

      <div className="mt-5">
        <Fact label="Term" value={data.termName} />
        {data.referenceNumber && <Fact label="Deposit reference" value={data.referenceNumber} />}
        {data.finalCollectionAt && (
          <Fact label="Final collection" value={longDate(data.finalCollectionAt)} />
        )}
        <Fact label="Members" value={String(data.rows.length)} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: 10 }}>
          <thead>
            <tr style={{ background: PAPER.headerFill, color: PAPER.inkSoft }}>
              <Th>#</Th>
              <Th>Member</Th>
              <Th>Tier</Th>
              <Th right>Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={row.memberName + index}>
                <Td muted>{index + 1}</Td>
                <Td>{row.memberName}</Td>
                <Td muted>{row.tierLabel}</Td>
                <Td right>{formatSgd(row.amountCents)}</Td>
                <Td muted>{statusText(row)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5">
        <Fact
          label="Banked in through the Income Deposit Form"
          value={formatSgd(data.bankedCents)}
        />
        {data.unofficialCents > 0 && (
          <Fact label="Held outside the OSL accounts" value={formatSgd(data.unofficialCents)} />
        )}
        <Fact label="Still outstanding" value={formatSgd(data.outstandingCents)} />
      </div>

      <div className="mt-10" style={{ width: '52%' }}>
        <Eyebrow>Prepared by</Eyebrow>
        <SignatureStamp signature={prepared?.signatureImage} name={prepared?.name ?? ''} />
        <Hairline className="mb-1" />
        <p className="m-0 font-semibold" style={{ fontSize: 11 }}>
          {prepared?.name ?? ''}
        </p>
        <p className="m-0" style={{ color: PAPER.inkSoft, fontSize: 9.5 }}>
          {prepared ? `${prepared.office}, ${data.organisationName}` : ''}
        </p>
        {prepared?.signedOn && (
          <p className="m-0" style={{ color: PAPER.inkSoft, fontSize: 9.5 }}>
            {longDate(prepared.signedOn)}
          </p>
        )}
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
        padding: '4px 7px',
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
}: {
  children?: React.ReactNode
  right?: boolean
  muted?: boolean
}) {
  return (
    <td
      className="tabular-nums"
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '4px 7px',
        borderBottom: `1px solid ${PAPER.rule}`,
        color: muted ? PAPER.inkSoft : undefined,
      }}
    >
      {children}
    </td>
  )
}
