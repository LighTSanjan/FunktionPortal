/**
 * The attendance sheet, on screen — the document the treasurer actually signs.
 *
 * Held to the .docx by the same test as the invoice. Where the two differ at
 * all it is in what a screen can do that paper cannot: the grid scrolls
 * sideways instead of turning the page.
 */
import type { AttendanceSheetDocData, ClaimLine } from '../types'
import { DEFAULT_VERIFYING_OFFICE } from '../types'
import { formatSgd, formatHours } from '../money'
import { FALLBACK_BAND_COLORS, MONTHS, shortDate, longDate } from '../theme'
import { Paper, Eyebrow, Fact, Hairline, PAPER, SignatureStamp } from './paper'

/**
 * Summarise uniform sessions; list hours when durations or rates differ.
 * The reasoning is in the .docx builder — this is the same rule, and the
 * drift test compares the string both produce.
 */
function claimWorking(lines: ClaimLine[]): string | null {
  if (lines.length === 0) return null
  const durations = new Set(lines.map((l) => l.durationMinutes))
  const rates = new Set(lines.map((l) => l.hourlyRateCents))
  if (durations.size === 1 && rates.size === 1) {
    const hours = formatHours(lines[0].durationMinutes)
    return `${formatSgd(lines[0].hourlyRateCents)}/hr x ${lines.length} ${
      lines.length === 1 ? 'session' : 'sessions'
    } x ${hours} hr/session`
  }
  return lines
    .map((l) => `${formatHours(l.durationMinutes)} hr @ ${formatSgd(l.hourlyRateCents)}/hr`)
    .join('  +  ')
}

export function AttendanceSheetPreview({ data }: { data: AttendanceSheetDocData }) {
  const { instructor, sessions, roster } = data
  const period = `${MONTHS[data.periodMonth - 1]} ${data.periodYear}`.toUpperCase()
  const branding = data.branding ?? {}
  const bands = branding.bandColors?.length ? branding.bandColors : FALLBACK_BAND_COLORS
  const landscape = sessions.length > 5
  const working = claimWorking(data.lines)
  const v = data.verification

  return (
    <Paper landscape={landscape}>
      <div className="flex items-center gap-4">
        <p className="m-0 shrink-0 font-semibold" style={{ fontSize: 20 }}>
          {data.organisationName}
        </p>
        <div>
          <p className="m-0 font-semibold" style={{ fontSize: 18 }}>
            Coaches Monthly Attendance Sheet
          </p>
          {branding.tagline && (
            <p className="m-0" style={{ color: PAPER.inkSoft, fontSize: 11 }}>
              {branding.tagline}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex" style={{ height: 5 }} aria-hidden="true">
        {bands.map((colour, i) => (
          <div key={i} style={{ background: `#${colour}`, width: `${100 / bands.length}%` }} />
        ))}
      </div>

      <div className="mt-5 flex items-start justify-between gap-6">
        <div>
          <Fact label="Club name" value={data.organisationName} />
          <Fact label="Month" value={period} />
        </div>
        <div className="text-right">
          <Fact
            label="Coach"
            value={`${instructor.fullName} — ${instructor.danceStyle}`}
            align="right"
          />
          {data.referenceNumber && (
            <Fact label="Reference" value={data.referenceNumber} align="right" />
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: 10 }}>
          <thead>
            <tr style={{ background: PAPER.headerFill, color: PAPER.inkSoft }}>
              <GridCell head style={{ textAlign: 'left' }}>
                Name
              </GridCell>
              {sessions.map((s, i) => (
                <GridCell head key={i}>
                  <span className="block">{shortDate(s.heldOn)}</span>
                  <span className="block">{formatHours(s.durationMinutes)} hr</span>
                </GridCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* The coach's own row. A NO here is a self-practice date: the
                club met, and nobody bills for it. */}
            <tr style={{ background: PAPER.instructorFill }}>
              <GridCell style={{ textAlign: 'left', fontWeight: 600 }}>
                {instructor.fullName}
              </GridCell>
              {sessions.map((s, i) => (
                <GridCell key={i}>
                  <Mark present={s.instructorPresent} />
                </GridCell>
              ))}
            </tr>
            {roster.map((m, i) => (
              <tr key={m.id}>
                <GridCell style={{ textAlign: 'left' }}>
                  <span style={{ color: PAPER.inkSoft }}>{i + 1}.&nbsp;&nbsp;</span>
                  {m.fullName}
                </GridCell>
                {sessions.map((s, j) => (
                  <GridCell key={j}>
                    <Mark present={s.presentMemberIds.has(m.id)} />
                  </GridCell>
                ))}
              </tr>
            ))}
            <tr style={{ background: PAPER.headerFill }}>
              <GridCell style={{ textAlign: 'left', fontWeight: 600 }}>Total pax present</GridCell>
              {sessions.map((s, i) => (
                <GridCell key={i} style={{ fontWeight: 600 }}>
                  {s.presentCount}
                </GridCell>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-5" style={{ fontSize: 11 }}>
        <span style={{ color: PAPER.inkSoft }}>Total coach claim:&nbsp;&nbsp;</span>
        <span className="font-semibold tabular-nums">{formatSgd(data.claimTotalCents)}</span>
        {working && <span style={{ color: PAPER.inkSoft }}>&nbsp;&nbsp;&nbsp;({working})</span>}
      </p>

      {data.clubFundBalanceCents !== undefined && (
        <Fact label="Balance of Club Fund" value={formatSgd(data.clubFundBalanceCents)} />
      )}
      <Fact
        label="Intended fund"
        value={`${data.fundSource === 'SEED' ? 'Seed' : 'Income'} Fund`}
      />

      <div className="mt-10" style={{ width: '52%' }}>
        <Eyebrow>Verified by</Eyebrow>
        <SignatureStamp signature={v?.signatureImage} name={v?.name ?? ''} />
        <Hairline className="mb-1" />
        <p className="m-0 mb-2" style={{ color: PAPER.inkSoft, fontSize: 9 }}>
          Signature
        </p>
        <Fact label="Name" value={v?.name ?? ''} />
        <Fact label="Office" value={v?.office ?? DEFAULT_VERIFYING_OFFICE} />
        {v?.studentId && <Fact label="Student ID" value={v.studentId} />}
        <Fact label="Date" value={v?.signedOn ? longDate(v.signedOn) : ''} />
      </div>
    </Paper>
  )
}

function Mark({ present }: { present: boolean }) {
  return (
    <span
      style={{
        color: present ? PAPER.ink : PAPER.inkSoft,
        fontWeight: present ? 600 : 400,
      }}
    >
      {present ? 'YES' : 'NO'}
    </span>
  )
}

function GridCell({
  children,
  head,
  style,
}: {
  children?: React.ReactNode
  head?: boolean
  style?: React.CSSProperties
}) {
  const Tag = head ? 'th' : 'td'
  return (
    <Tag
      style={{
        padding: '4px 7px',
        borderBottom: `1px solid ${PAPER.rule}`,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        fontWeight: head ? 600 : undefined,
        fontSize: head ? 9 : undefined,
        letterSpacing: head ? '.08em' : undefined,
        textTransform: head ? 'uppercase' : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}
