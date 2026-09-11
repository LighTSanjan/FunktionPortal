import Link from 'next/link'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
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
} from '@/modules/fees/queries'
import { TIER_LABEL } from '@/modules/fees/tiers'
import { splitGst, DEFAULT_GST_BASIS_POINTS } from '@/modules/fees/money'
import { formatSgd } from '@/modules/coach-claim/money'
import { longDate } from '@/modules/coach-claim/theme'
import { TermForm } from './_components/term-form'
import { QrForm } from './_components/qr-form'
import { NewTermForm } from './_components/new-term-form'
import { FiledToggle } from './_components/filed-toggle'
import { subscriptionWorkflow } from '@/modules/workflow/subscription'
import { WorkflowStrip } from '@/modules/workflow/ui'
import { DecideButtons } from './_components/decide-buttons'
import { CloseButton } from './_components/close-button'
import { LinkForm } from './_components/link-form'

export const dynamic = 'force-dynamic'

/** `2026-01-05` for a date input, in the calendar the date was stored in. */
function dateValue(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : ''
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ term?: string }>
}) {
  const { orgSlug } = await params
  const { term: termParam } = await searchParams
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'fee.manage')
  const { userId } = await verifySession()

  const terms = await listTerms(userId, org.id)

  // No terms is a first use, not a missing page. notFound() here was a
  // treasurer being told the screen does not exist, with no way to make it
  // exist — terms could only be created by the seed script, so a club that
  // had not been seeded could never reach subscription collection at all.
  if (terms.length === 0) {
    return (
      <div className="mx-auto max-w-[720px] space-y-5">
        <PageHeader
          breadcrumbItems={[
            { label: org.name, href: `/${orgSlug}/dashboard` },
            { label: 'Subscriptions' },
          ]}
          title="Open your first term"
          subtitle="Subscriptions are collected per term, and everything below hangs off one: what each tier pays, who has declared, and the deposit form at the end."
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

  const workflow = await subscriptionWorkflow(userId, org.id, orgSlug, new Date(), term.id)

  const split = splitGst(totals.bankableCents, settings?.gstBasisPoints ?? DEFAULT_GST_BASIS_POINTS)
  const queue = rows.filter((row) => row.status === 'DECLARED')
  const uncertain = rows.filter((row) => row.tierUncertain)

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Subscriptions', href: `/${orgSlug}/fees/collection` },
          { label: term.name },
        ]}
        title={`${term.name} collection`}
        subtitle="Who owes what, who says they have paid, and who the club has actually recorded as having paid. Those last two are separate on purpose."
        actions={
          // Closing the collection and the money reaching the club's account
          // are different events. This used to say "Banked in" the moment the
          // collection closed, which is the portal asserting something only
          // the bank statement can.
          term.closed ? (
            deposit?.submittedToOslAt ? (
              <Badge variant="success">Filed with OSL</Badge>
            ) : (
              <Badge variant="warning">Closed, not yet filed</Badge>
            )
          ) : undefined
        }
      />

      {workflow && <WorkflowStrip workflow={workflow} />}

      {terms.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {terms.map((row) => (
            <Link
              key={row.id}
              href={`/${orgSlug}/fees/collection?term=${row.id}`}
              className={`lapis-press inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
                row.id === term.id
                  ? 'border-brand-ink bg-paper text-text'
                  : 'border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text'
              }`}
            >
              {row.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Owed"
          value={formatSgd(totals.owedCents)}
          note={`${rows.filter((row) => row.onRoster).length} on the roster`}
        />
        <Tile
          label="Declared, not decided"
          value={formatSgd(totals.declaredCents)}
          note={`${totals.declared} waiting`}
        />
        <Tile
          label="Confirmed"
          value={formatSgd(totals.confirmedCents)}
          note={`${totals.confirmed} of ${totals.members}`}
        />
        <Tile
          label="To bank in"
          value={formatSgd(totals.bankableCents)}
          note={`net ${formatSgd(split.netCents)} + GST ${formatSgd(split.gstCents)}`}
        />
      </div>

      {uncertain.length > 0 && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="text-[14px] font-semibold">The roster does not say what these owe</p>
            <p className="max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
              Their status cell is blank, hedged, or something the portal has not seen before, so
              the tier below is a guess at the full rate. Fix the roster label, or let the guess
              stand knowingly.
            </p>
            <ul className="space-y-1 text-[12.5px] text-text-muted">
              {uncertain.map((row) => (
                <li key={row.memberId}>
                  <span className="font-medium text-text">{row.memberName}</span> &mdash;{' '}
                  {row.tierBecause}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {queue.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-[14px] font-semibold">
                {queue.length} to check against the bank statement
              </h2>
              <p className="mt-0.5 text-[12.5px] text-text-muted">
                A declaration is a claim. Confirming it is the record.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {queue.map((row) => (
                <li key={row.memberId} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{row.memberName}</p>
                    <p className="mt-0.5 text-[12.5px] tabular-nums text-text-muted">
                      {formatSgd(row.amountCents)} · {TIER_LABEL[row.tier]} ·{' '}
                      <span className="font-mono">{row.paymentReference}</span>
                    </p>
                    {row.id && (
                      <Link
                        href={`/${orgSlug}/fees/collection/${row.id}/proof`}
                        target="_blank"
                        rel="noopener"
                        prefetch={false}
                        className="mt-1 inline-block text-[12.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
                      >
                        Open the screenshot
                      </Link>
                    )}
                  </div>
                  {row.id && (
                    <DecideButtons
                      orgSlug={orgSlug}
                      paymentId={row.id}
                      memberName={row.memberName}
                      ownDeclaration={row.declaredByUserId === userId}
                    />
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-[14px] font-semibold">Everyone</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[10.5px] uppercase tracking-[0.1em] text-text-subtle">
                  <th className="px-5 py-2.5 font-semibold">Member</th>
                  <th className="py-2.5 font-semibold">Tier</th>
                  <th className="py-2.5 text-right font-semibold">Amount</th>
                  <th className="py-2.5 pl-6 font-semibold">Status</th>
                  <th className="py-2.5 pr-5 font-semibold">Confirmed by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.memberId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-[13px]">
                      {row.memberName}
                      {!row.onRoster && (
                        <span className="ml-1.5 text-[11.5px] text-text-subtle">
                          left the club
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-[12.5px] text-text-muted">
                      {TIER_LABEL[row.tier]}
                      {row.tierUncertain && (
                        <span className="ml-1.5 text-warning" title={row.tierBecause}>
                          ?
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-[13px] tabular-nums">
                      {formatSgd(row.amountCents)}
                    </td>
                    <td className="py-2.5 pl-6">
                      <RowStatus row={row} />
                      {row.route === 'UNOFFICIAL' && (
                        <span
                          className="ml-1.5 text-[11.5px] text-text-subtle"
                          title={row.routeReason ?? undefined}
                        >
                          outside OSL
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-5 text-[12.5px] text-text-muted">
                      {row.confirmedByName ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {unlinked.accounts.length > 0 && unlinked.members.length > 0 && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div>
              <h2 className="text-[15px] font-semibold">Accounts with no roster row</h2>
              <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
                Signing in links itself when the account&rsquo;s email is the one the club already
                holds. These signed up with a different address, so nothing matched &mdash; and
                until somebody says which row they are, the portal cannot tell them what they
                owe. Asking them to pick their own would be asking them to assert an identity,
                so it is the club&rsquo;s call. It is written to the audit log.
              </p>
            </div>
            <ul className="space-y-3">
              {unlinked.accounts.map((account) => (
                <li key={account.userId}>
                  <LinkForm orgSlug={orgSlug} account={account} members={unlinked.members} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 py-6">
          <div>
            <h2 className="text-[15px] font-semibold">How members pay</h2>
            <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
              A new PayNow QR is generated for each collection, so it belongs to this term and
              not to the club. Until it is up, members can see what they owe and have no way to
              pay it.
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

      <Card>
        <CardContent className="space-y-4 py-6">
          <div>
            <h2 className="text-[15px] font-semibold">The term</h2>
            <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
              What each tier pays, and the two dates the guidelines hang off: OSL want two weeks&rsquo;
              notice before the collection opens, and the Income Deposit Form is due one working day
              after the final collection.
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

      {!term.closed && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <h2 className="text-[15px] font-semibold">Close the collection</h2>
            <CloseButton
              orgSlug={orgSlug}
              termId={term.id}
              bankable={formatSgd(totals.bankableCents)}
            />
          </CardContent>
        </Card>
      )}

      {deposit && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div>
              <h2 className="text-[15px] font-semibold">The Income Deposit Form</h2>
              <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
                Download it filled in. This is OSL&rsquo;s own workbook with these figures written
                into its blanks &mdash; their layout, their GL account codes and their GST
                formulas, untouched. The spreadsheet is the working copy, the one OSL can reopen
                and correct; the PDF is the same form fixed, for filing. A test holds the two to
                the same text, so they cannot come to say different things. The breakdown goes
                by tier rather than by member, which is what the form asks for and keeps
                forty-five names off a document that leaves the club. Only money on the official
                route is counted: anything held outside OSL was never banked, and putting it here
                would make the form disagree with the statement it gets checked against.
              </p>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr]">
              <Row label="Reference" value={deposit.referenceNumber ?? '—'} mono />
              <Row label="WBS element" value={deposit.wbsElement} mono />
              <Row label="Gross collected" value={formatSgd(deposit.grossCents)} />
              <Row label="Net of GST" value={formatSgd(deposit.netCents)} />
              <Row label="GST" value={formatSgd(deposit.gstCents)} />
              {deposit.finalCollectionAt && (
                <Row label="Final collection" value={longDate(deposit.finalCollectionAt)} />
              )}
              {deposit.submissionDueAt && (
                <Row label="Due at OSL" value={longDate(deposit.submissionDueAt)} />
              )}
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

            <FiledToggle
              orgSlug={orgSlug}
              termId={term.id}
              filed={deposit.submittedToOslAt !== null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-text-subtle">{label}</dt>
      <dd className={`m-0 font-medium tabular-nums ${mono ? 'font-mono text-[12.5px]' : ''}`}>
        {value}
      </dd>
    </>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
        {label}
      </p>
      <p className="mt-2 text-[19px] font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1.5 text-[11.5px] tabular-nums text-text-muted">{note}</p>
    </div>
  )
}

function RowStatus({ row }: { row: PaymentRow }) {
  if (row.status === 'CONFIRMED') return <Badge variant="success">Confirmed</Badge>
  if (row.status === 'DECLARED') return <Badge variant="warning">Declared</Badge>
  if (row.status === 'REJECTED') return <Badge variant="danger">Refused</Badge>
  return <span className="text-[12.5px] text-text-subtle">Not paid</span>
}

/**
 * A plausible term to open, from today's date.
 *
 * SUTD runs three trimesters a year, starting in September, January and May.
 * Guessing is not the point — every field is editable — but a form that opens
 * with the term somebody is almost certainly creating is two clicks instead
 * of eight, and this screen is reached exactly once per term.
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
