import Link from 'next/link'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import {
  listTerms,
  currentTerm,
  listCollection,
  getDeposit,
  listUnlinked,
  type PaymentRow,
  type TermRow,
} from '@/modules/fees/queries'
import { TIER_LABEL } from '@/modules/fees/tiers'
import { splitGst, DEFAULT_GST_BASIS_POINTS } from '@/modules/fees/money'
import { formatSgd } from '@/modules/coach-claim/money'
import { longDate } from '@/modules/coach-claim/theme'
import { TermForm } from './_components/term-form'
import { QrForm } from './_components/qr-form'
import { NewTermForm } from './_components/new-term-form'
import { FiledToggle } from './_components/filed-toggle'
import { DecideButtons } from './_components/decide-buttons'
import { CloseButton } from './_components/close-button'
import { LinkForm } from './_components/link-form'
import { TermPicker } from './_components/term-picker'
import { FeeTable, type FeeRowView, type RowState } from './_components/fee-table'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'members', label: 'Members' },
  { key: 'check', label: 'To check' },
  { key: 'setup', label: 'Term setup' },
  { key: 'close', label: 'Close & deposit' },
] as const
type Tab = (typeof TABS)[number]['key']

/** `2026-01-05` for a date input, in the calendar the date was stored in. */
function dateValue(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : ''
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ term?: string; tab?: string }>
}) {
  const { orgSlug } = await params
  const { term: termParam, tab: tabParam } = await searchParams
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'fee.manage')
  const { userId } = await verifySession()

  const terms = await listTerms(userId, org.id)

  // No terms is a first use, not a missing page: a club that has never opened
  // one has to be able to, from here.
  if (terms.length === 0) {
    return (
      <div className="mx-auto max-w-[720px] space-y-5">
        <PageHeader
          breadcrumbItems={[
            { label: org.name, href: `/${orgSlug}/dashboard` },
            { label: 'Membership fees' },
          ]}
          title="Open your first term"
          subtitle="Membership fees are collected per term. Give it a name, its dates and what a full and half term cost — you can change any of it later."
        />
        <Card>
          <CardContent className="py-6">
            <NewTermForm orgSlug={orgSlug} suggestion={suggestTerm(new Date())} />
          </CardContent>
        </Card>
      </div>
    )
  }

  const fallback = await currentTerm(userId, org.id)
  const term = terms.find((row) => row.id === termParam) ?? fallback ?? terms[0]
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : 'members'

  const [{ rows, totals }, deposit, unlinked, settings] = await Promise.all([
    listCollection(userId, org.id, term.id),
    getDeposit(userId, org.id, term.id),
    listUnlinked(userId, org.id),
    dbAs(userId, (tx) =>
      tx.organisationSettings.findUnique({
        where: { orgId: org.id },
        select: { gstBasisPoints: true },
      })
    ),
  ])

  const split = splitGst(totals.bankableCents, settings?.gstBasisPoints ?? DEFAULT_GST_BASIS_POINTS)
  const views = rows.map((row) => toView(row, userId))
  // Everybody asked to pay something, plus anybody who paid and has since left.
  const charged = rows.filter((row) => row.status === 'CONFIRMED' || (row.onRoster && row.amountCents > 0))
  const paid = rows.filter((row) => row.status === 'CONFIRMED')
  const toCheck = rows.filter((row) => row.status === 'DECLARED')
  const collectedCents = totals.confirmedCents
  const expectedCents = collectedCents + totals.owedCents
  const progress = expectedCents > 0 ? Math.min(100, Math.round((collectedCents / expectedCents) * 100)) : 0

  const missing: string[] = []
  if (term.fullFeeCents === 0) missing.push('the fees')
  if (!term.hasPaynowQr) missing.push('the PayNow QR')
  if (!term.finalCollectionAt) missing.push('the final collection date')

  const base = `/${orgSlug}/fees/collection?term=${term.id}`

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Membership fees', href: `/${orgSlug}/fees/collection` },
          { label: term.name },
        ]}
        title="Membership fees"
        subtitle={
          term.finalCollectionAt && !term.closed
            ? `${term.name} · collecting until ${longDate(term.finalCollectionAt)}`
            : term.name
        }
        actions={
          <>
            {term.closed &&
              (deposit?.submittedToOslAt ? (
                <Badge variant="success">Filed with OSL</Badge>
              ) : (
                <Badge variant="warning">Closed, not yet filed</Badge>
              ))}
            {terms.length > 1 && (
              <TermPicker
                orgSlug={orgSlug}
                current={term.id}
                terms={terms.map((row) => ({ id: row.id, name: row.name }))}
              />
            )}
          </>
        }
      />

      <section className="rounded-[var(--radius-md)] border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Collected
            </p>
            <p className="mt-1 text-[24px] font-semibold leading-none tabular-nums">
              {formatSgd(collectedCents)}
              <span className="text-[14px] font-normal text-text-muted"> of {formatSgd(expectedCents)}</span>
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-text-muted">
            <Stat label="paid" value={`${paid.length} of ${charged.length}`} />
            <Stat label="to check" value={String(toCheck.length)} href={toCheck.length ? `${base}&tab=check` : undefined} />
            <Stat label="still owed" value={formatSgd(totals.owedCents)} />
          </dl>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-hover"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Share of fees collected"
        >
          <div className="h-full rounded-full bg-accent-500" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {missing.length > 0 && !term.closed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-warning/30 bg-warning/8 px-4 py-3">
          <p className="text-[13px] text-text">
            <span className="font-semibold">Finish setting up {term.name}:</span> add {listOf(missing)}.
          </p>
          {tab !== 'setup' && (
            <Link
              href={`${base}&tab=setup`}
              className="text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              Set it up
            </Link>
          )}
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Membership fee sections">
        {TABS.map((item) => {
          const count = item.key === 'check' ? toCheck.length : 0
          return (
            <Link
              key={item.key}
              href={`${base}&tab=${item.key}`}
              aria-current={tab === item.key ? 'page' : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                tab === item.key
                  ? 'border-accent-500 text-text'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {item.label}
              {count > 0 && (
                <span className="rounded-full bg-warning/15 px-1.5 text-[11px] tabular-nums text-warning">{count}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {tab === 'members' && (
        <div className="space-y-4">
          {unlinked.accounts.length > 0 && unlinked.members.length > 0 && (
            <details id="unlinked" className="rounded-[var(--radius-md)] border border-border bg-surface px-5 py-4" open={unlinked.accounts.some((a) => a.claimedStudentId)}>
              <summary className="cursor-pointer text-[13.5px] font-semibold">
                {unlinked.accounts.length} portal account{unlinked.accounts.length === 1 ? '' : 's'} not matched to
                the roster
              </summary>
              <p className="mt-2 max-w-[70ch] text-[12.5px] leading-relaxed text-text-muted">
                People are matched automatically when they sign in with the email on the roster, or with
                their student-ID address (1001234@mymail.sutd.edu.sg). These signed in some other way. Where
                they gave a student ID the row is already picked — check it and confirm.
              </p>
              <ul className="mt-4 space-y-3">
                {unlinked.accounts.map((account) => (
                  <li key={account.userId}>
                    <LinkForm orgSlug={orgSlug} account={account} members={unlinked.members} />
                  </li>
                ))}
              </ul>
            </details>
          )}

          <FeeTable
            orgSlug={orgSlug}
            termId={term.id}
            closed={term.closed}
            rates={{
              fullFeeCents: term.fullFeeCents,
              halfFeeCents: term.halfFeeCents,
              exchangeFeeCents: term.exchangeFeeCents,
            }}
            rows={views}
          />
          <p className="text-[12px] leading-relaxed text-text-subtle">
            Click a fee to change it, or tick several people to set theirs together. Nobody records or
            checks their own payment.
          </p>
        </div>
      )}

      {tab === 'check' && <CheckTab orgSlug={orgSlug} rows={rows} userId={userId} />}

      {tab === 'setup' && <SetupTab orgSlug={orgSlug} term={term} />}

      {tab === 'close' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 py-6">
              <div>
                <h2 className="text-[15px] font-semibold">
                  {term.closed ? 'The collection is closed' : 'Before you close'}
                </h2>
                <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
                  Closing freezes this term&rsquo;s fees and payments and raises the Income Deposit Form
                  from what was paid through the OSL collection. It is due at OSL one working day after
                  the final collection.
                </p>
              </div>
              <ul className="space-y-2 text-[13px]">
                <Check ok={toCheck.length === 0} text={toCheck.length === 0 ? 'Nothing waiting to be checked' : `${toCheck.length} payment${toCheck.length === 1 ? '' : 's'} still to check`} href={toCheck.length ? `${base}&tab=check` : undefined} />
                <Check
                  ok={totals.owedCents === 0}
                  warnOnly
                  text={
                    totals.owedCents === 0
                      ? 'Everybody charged has paid'
                      : `${charged.length - paid.length} still owe ${formatSgd(totals.owedCents)} — closing leaves them owing`
                  }
                />
                <Check ok={Boolean(term.finalCollectionAt)} warnOnly text={term.finalCollectionAt ? `Final collection ${longDate(term.finalCollectionAt)}` : 'No final collection date — today is used'} />
              </ul>
              <dl className="grid max-w-[420px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
                <dt className="text-text-muted">To bank in</dt>
                <dd className="m-0 text-right font-semibold tabular-nums">{formatSgd(totals.bankableCents)}</dd>
                <dt className="text-text-muted">of which GST</dt>
                <dd className="m-0 text-right tabular-nums">{formatSgd(split.gstCents)}</dd>
                {totals.confirmedCents > totals.bankableCents && (
                  <>
                    <dt className="text-text-muted">Paid outside OSL</dt>
                    <dd className="m-0 text-right tabular-nums">
                      {formatSgd(totals.confirmedCents - totals.bankableCents)}
                    </dd>
                  </>
                )}
              </dl>
              {!term.closed && (
                <CloseButton orgSlug={orgSlug} termId={term.id} bankable={formatSgd(totals.bankableCents)} />
              )}
            </CardContent>
          </Card>

          {deposit && (
            <Card id="deposit">
              <CardContent className="space-y-4 py-6">
                <div>
                  <h2 className="text-[15px] font-semibold">The Income Deposit Form</h2>
                  <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
                    OSL&rsquo;s own workbook with these figures filled in, grouped by fee rather than by
                    person so no member names leave the club. Send it, then mark it as sent.
                  </p>
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr]">
                  <Row label="Reference" value={deposit.referenceNumber ?? '—'} mono />
                  <Row label="WBS element" value={deposit.wbsElement} mono />
                  <Row label="Gross collected" value={formatSgd(deposit.grossCents)} />
                  <Row label="Net of GST" value={formatSgd(deposit.netCents)} />
                  <Row label="GST" value={formatSgd(deposit.gstCents)} />
                  {deposit.submissionDueAt && <Row label="Due at OSL" value={longDate(deposit.submissionDueAt)} />}
                </dl>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                  <a
                    href={`/${orgSlug}/fees/collection/deposit-form?term=${term.id}`}
                    className="inline-flex items-center rounded-[var(--radius-sm)] bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-700"
                  >
                    Download the spreadsheet
                  </a>
                  <Link
                    href={`/${orgSlug}/fees/collection/deposit-form/print?term=${term.id}`}
                    className="text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
                  >
                    Print it as a PDF
                  </Link>
                  <Link
                    href={`/${orgSlug}/fees/collection/summary?term=${term.id}`}
                    className="text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
                  >
                    The club&rsquo;s own record of who paid
                  </Link>
                </div>
                <FiledToggle orgSlug={orgSlug} termId={term.id} filed={deposit.submittedToOslAt !== null} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function toView(row: PaymentRow, userId: string): FeeRowView {
  const state: RowState =
    row.status === 'CONFIRMED'
      ? 'paid'
      : row.status === 'DECLARED'
        ? 'check'
        : row.status === 'REJECTED'
          ? 'refused'
          : row.amountCents === 0
            ? 'waived'
            : 'unpaid'
  return {
    memberId: row.memberId,
    paymentId: row.id,
    name: row.memberName,
    studentId: row.studentId,
    tier: row.tier,
    amountCents: row.amountCents,
    state,
    feeSource: row.feeSource,
    arrangement: row.arrangement,
    rosterReading: row.rosterFee,
    uncertain: row.tierUncertain,
    because: row.tierBecause,
    paidBy: row.confirmedByName,
    recorded: row.source === 'RECORDED',
    outsideOsl: row.route === 'UNOFFICIAL',
    reference: row.paymentReference,
    rejectedReason: row.rejectedReason,
    hasAccount: row.hasAccount,
    isYou: row.isYou,
    declaredByYou: row.declaredByUserId === userId,
  }
}

/** Declarations, each beside its screenshot, so checking one is one look. */
function CheckTab({ orgSlug, rows, userId }: { orgSlug: string; rows: PaymentRow[]; userId: string }) {
  const waiting = rows.filter((row) => row.status === 'DECLARED')
  const refused = rows.filter((row) => row.status === 'REJECTED')

  if (waiting.length === 0 && refused.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-1 py-10 text-center">
          <p className="font-medium">Nothing to check</p>
          <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
            When a member says they have paid in the portal, their screenshot shows up here to compare
            with the bank statement. Payments you record yourself skip this.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {waiting.map((row) => (
        <Card key={row.memberId} id={`payment-${row.id}`}>
          <CardContent className="flex flex-wrap gap-5 py-5">
            {row.id && row.hasProof && (
              <a
                href={`/${orgSlug}/fees/collection/${row.id}/proof`}
                target="_blank"
                rel="noopener"
                className="block shrink-0"
                title="Open the screenshot full size"
              >
                {/* Streamed by a route that re-checks fee.manage on every request. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/${orgSlug}/fees/collection/${row.id}/proof`}
                  alt={`${row.memberName}'s payment screenshot`}
                  className="max-h-[260px] w-auto max-w-[200px] rounded-[var(--radius-sm)] border border-border bg-white object-contain"
                />
              </a>
            )}
            <div className="min-w-[14rem] flex-1 space-y-3">
              <div>
                <p className="text-[15px] font-semibold">{row.memberName}</p>
                <p className="mt-0.5 text-[13px] tabular-nums text-text-muted">
                  Should show <span className="font-semibold text-text">{formatSgd(row.amountCents)}</span> ·{' '}
                  {TIER_LABEL[row.tier]}
                  {row.tierUncertain && row.feeSource === 'roster' && (
                    <span className="text-warning"> · fee is a guess: {row.tierBecause}</span>
                  )}
                </p>
                <p className="mt-0.5 text-[12.5px] text-text-muted">
                  Reference <span className="font-mono text-text">{row.paymentReference}</span>
                  {row.declaredAt && ` · sent ${row.declaredAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`}
                </p>
              </div>
              {row.id && (
                <DecideButtons
                  orgSlug={orgSlug}
                  paymentId={row.id}
                  memberName={row.memberName}
                  ownDeclaration={row.declaredByUserId === userId || row.isYou}
                />
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {refused.length > 0 && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="text-[13.5px] font-semibold">Couldn&rsquo;t match</p>
            <ul className="space-y-1 text-[12.5px] text-text-muted">
              {refused.map((row) => (
                <li key={row.memberId}>
                  <span className="font-medium text-text">{row.memberName}</span> — {row.rejectedReason}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-text-subtle">
              They can send it again. If it turns up on the statement, record it from the Members tab.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SetupTab({ orgSlug, term }: { orgSlug: string; term: TermRow }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 py-6">
          <div>
            <h2 className="text-[15px] font-semibold">Fees and dates</h2>
            <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
              What each fee costs this term. Anyone can still be given a different amount from the
              Members tab. OSL want two weeks&rsquo; notice before the collection opens.
            </p>
          </div>
          <TermForm
            orgSlug={orgSlug}
            locked={term.closed}
            values={{
              termId: term.id,
              fullFee: String(term.fullFeeCents / 100),
              halfFee: String(term.halfFeeCents / 100),
              exchangeFee: term.exchangeFeeCents === null ? '' : String(term.exchangeFeeCents / 100),
              collectionOpensAt: dateValue(term.collectionOpensAt),
              finalCollectionAt: dateValue(term.finalCollectionAt),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-6">
          <div>
            <h2 className="text-[15px] font-semibold">PayNow QR</h2>
            <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
              A new QR is made for each collection. Members see it on their fee page.
            </p>
          </div>
          <QrForm
            orgSlug={orgSlug}
            termId={term.id}
            termName={term.name}
            hasQr={term.hasPaynowQr}
            uploadedAt={term.paynowQrUploadedAt}
            locked={term.closed}
          />
        </CardContent>
      </Card>

      <details className="rounded-[var(--radius-md)] border border-border bg-surface px-5 py-4">
        <summary className="cursor-pointer text-[13.5px] font-semibold">Start a new term</summary>
        <div className="mt-4">
          <NewTermForm orgSlug={orgSlug} suggestion={suggestTerm(new Date())} />
        </div>
      </details>

      <p className="text-[12px] leading-relaxed text-text-subtle">
        Until you set someone&rsquo;s fee, it is read off their roster status: &ldquo;Confirmed&rdquo; is a
        full term, &ldquo;1/2 term&rdquo; is half, &ldquo;Exchange&rdquo; is the exchange fee, and anyone
        marked as left is not charged.
      </p>
    </div>
  )
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <span className="font-semibold tabular-nums text-text">{value}</span> {label}
    </>
  )
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="m-0">
        {href ? (
          <Link href={href} className="underline-offset-4 hover:underline">
            {content}
          </Link>
        ) : (
          content
        )}
      </dd>
    </div>
  )
}

function Check({ ok, text, href, warnOnly }: { ok: boolean; text: string; href?: string; warnOnly?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
          ok ? 'bg-success' : warnOnly ? 'bg-warning' : 'bg-danger'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      {href ? (
        <Link href={href} className="font-medium text-accent-600 underline-offset-4 hover:underline">
          {text}
        </Link>
      ) : (
        <span>{text}</span>
      )}
    </li>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-text-subtle">{label}</dt>
      <dd className={`m-0 font-medium tabular-nums ${mono ? 'font-mono text-[12.5px]' : ''}`}>{value}</dd>
    </>
  )
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * A plausible term to open, from today's date.
 *
 * SUTD runs three trimesters a year, starting in September, January and May.
 * Every field is editable; this only makes the usual case two clicks.
 */
function suggestTerm(now: Date): { name: string; startDate: string; endDate: string } {
  const TRIMESTERS = [
    { index: 1, startMonth: 8, endMonth: 11 },
    { index: 2, startMonth: 0, endMonth: 3 },
    { index: 3, startMonth: 4, endMonth: 7 },
  ]
  const month = now.getMonth()
  const current =
    TRIMESTERS.find((t) =>
      t.startMonth <= t.endMonth
        ? month >= t.startMonth && month <= t.endMonth
        : month >= t.startMonth || month <= t.endMonth
    ) ?? TRIMESTERS[0]

  const year = now.getFullYear()
  const start = new Date(year, current.startMonth, 1)
  if (start > now) start.setFullYear(year - 1)
  const end = new Date(start.getFullYear(), current.endMonth + 1, 0)
  if (end < start) end.setFullYear(end.getFullYear() + 1)

  return {
    name: `Trimester ${current.index} ${start.getFullYear()}`,
    startDate: iso(start),
    endDate: iso(end),
  }
}

function iso(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
