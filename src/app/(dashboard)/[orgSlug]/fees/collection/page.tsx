import Link from 'next/link'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import {
  listTerms,
  currentTerm,
  listCollection,
  getDeposit,
  listUnlinked,
  type PaymentRow,
  type TermRow,
} from '@/modules/fees/queries'
import { splitGst, DEFAULT_GST_BASIS_POINTS } from '@/modules/fees/money'
import { formatSgd } from '@/modules/coach-claim/money'
import { isoDate, longDate } from '@/modules/coach-claim/theme'
import { fromDateColumn, singaporeDay } from '@/lib/date-only'
import { getForm, listResponses } from '@/modules/membership-form/queries'
import { TermForm } from './_components/term-form'
import { QrForm } from './_components/qr-form'
import { NewTermForm } from './_components/new-term-form'
import { FiledToggle } from './_components/filed-toggle'
import { CloseButton } from './_components/close-button'
import { LinkForm } from './_components/link-form'
import { TermPicker } from './_components/term-picker'
import { FeeTable, type FeeRowView, type Filter, type RowState } from './_components/fee-table'
import { FormControls } from './_components/form-controls'
import { FormSettings } from './_components/form-settings'
import { AudiencePicker } from './_components/audience-picker'
import { QuestionList } from './_components/question-list'
import { ResponsesList, type ResponseView } from './_components/responses-list'
import { FormStateBadge, Notice, Panel, linkButtonClass } from '../_components/ui'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'form', label: 'Form' },
  { key: 'responses', label: 'Responses' },
  { key: 'payments', label: 'Payments' },
  { key: 'deposit', label: 'Bank in' },
] as const
type Tab = (typeof TABS)[number]['key']

/** Links written before the form existed still land somewhere sensible. */
const OLD_TABS: Record<string, { tab: Tab; show?: Filter }> = {
  members: { tab: 'payments' },
  check: { tab: 'payments', show: 'check' },
  setup: { tab: 'form' },
  close: { tab: 'deposit' },
}

const SGT = 'Asia/Singapore'

/**
 * `2026-01-05` for a date input. The local calendar, never `toISOString()`:
 * east of UTC a local midnight is still the day before, so the field would
 * show the 29th for the 30th and saving would write the 29th back.
 */
function dateValue(value: Date | null): string {
  return value ? isoDate(value) : ''
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ term?: string; tab?: string; show?: string }>
}) {
  const { orgSlug } = await params
  const { term: termParam, tab: tabParam, show: showParam } = await searchParams
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
          subtitle="Each term has its own membership form and fees. Give it a name, its dates and what a full and half term cost — you can change any of it later."
        />
        <Panel>
          <NewTermForm orgSlug={orgSlug} suggestion={suggestTerm(singaporeDay(new Date()))} />
        </Panel>
      </div>
    )
  }

  const fallback = await currentTerm(userId, org.id)
  const term = terms.find((row) => row.id === termParam) ?? fallback ?? terms[0]

  const [{ rows, totals }, deposit, unlinked, settings, form, responses] = await Promise.all([
    listCollection(userId, org.id, term.id),
    getDeposit(userId, org.id, term.id),
    listUnlinked(userId, org.id),
    dbAs(userId, (tx) =>
      tx.organisationSettings.findUnique({
        where: { orgId: org.id },
        select: { gstBasisPoints: true },
      })
    ),
    getForm(userId, org.id, term.id),
    listResponses(userId, org.id, term.id),
  ])

  const legacy = tabParam ? OLD_TABS[tabParam] : undefined
  const defaultTab: Tab = term.closed ? 'deposit' : form.state === 'DRAFT' ? 'form' : form.state === 'OPEN' ? 'responses' : 'payments'
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : (legacy?.tab ?? defaultTab)
  const show = (legacy?.show ?? showParam) as Filter | undefined

  const split = splitGst(totals.bankableCents, settings?.gstBasisPoints ?? DEFAULT_GST_BASIS_POINTS)
  const views = rows.map((row) => toView(row, userId))
  // Everybody asked to pay something, plus anybody who paid and has since left.
  const charged = rows.filter((row) => row.status === 'CONFIRMED' || (row.onRoster && row.amountCents > 0))
  const paid = rows.filter((row) => row.status === 'CONFIRMED')
  const toCheck = rows.filter((row) => row.status === 'DECLARED')
  const unmatched = responses.filter((row) => !row.memberId)
  const heldResponses = unmatched.filter((row) => row.held)
  const closeBlockedReason =
    toCheck.length > 0 && heldResponses.length > 0
      ? `Check ${toCheck.length} pending payment${toCheck.length === 1 ? '' : 's'} and match ${heldResponses.length} held form response${heldResponses.length === 1 ? '' : 's'} first.`
      : toCheck.length > 0
        ? `Check ${toCheck.length} pending payment${toCheck.length === 1 ? '' : 's'} first.`
        : heldResponses.length > 0
          ? `Match ${heldResponses.length} held form response${heldResponses.length === 1 ? '' : 's'} to the roster first.`
          : undefined
  // Nothing on the OSL route and nothing that could still land on it: the
  // collection closes with no money to bank and no deposit form.
  const nothingToBank =
    !term.closed && totals.bankableCents === 0 && toCheck.length === 0 && !unmatched.some((row) => row.held)
  const collectedCents = totals.confirmedCents
  const expectedCents = collectedCents + totals.owedCents
  const progress = expectedCents > 0 ? Math.min(100, Math.round((collectedCents / expectedCents) * 100)) : 0

  const blockers: string[] = []
  if (term.fullFeeCents === 0) blockers.push('the fees')
  if (!term.hasPaynowQr) blockers.push('the PayNow QR')

  const base = `/${orgSlug}/fees/collection?term=${term.id}`
  const rates = {
    fullFeeCents: term.fullFeeCents,
    halfFeeCents: term.halfFeeCents,
    exchangeFeeCents: term.exchangeFeeCents,
  }

  const stateLine =
    form.state === 'OPEN'
      ? form.openedAt
        ? `Opened ${sgDate(form.openedAt)}`
        : null
      : form.state === 'CLOSED' && form.closedAt
        ? `Closed ${sgDate(form.closedAt)}`
        : 'Members can’t see it until you open it'

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
            {terms.length > 1 && (
              <TermPicker
                orgSlug={orgSlug}
                current={term.id}
                terms={terms.map((row) => ({ id: row.id, name: row.name }))}
              />
            )}
            <Link href={`/${orgSlug}/fees`} className={linkButtonClass('secondary')}>
              Your own fee
            </Link>
          </>
        }
      />

      {/* The form, the money, and what to do next — the same strip on every tab. */}
      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
              {term.name} membership form
            </p>
            <FormStateBadge state={form.state} banked={term.closed} bankedAs={deposit ? 'Banked in' : 'Collection closed'} />
            {!term.closed && stateLine && <p className="text-[12px] text-text-muted">{stateLine}</p>}
          </div>
          {term.closed ? (
            <p className="text-[13px] text-text-muted">
              {!deposit
                ? 'Nothing came in through OSL, so there’s no deposit form to file.'
                : deposit.submittedToOslAt
                  ? 'Deposit form filed with OSL.'
                  : 'Banked in. The deposit form still needs filing.'}
            </p>
          ) : (
            <FormControls orgSlug={orgSlug} termId={term.id} state={form.state} banked={term.closed} blockers={blockers} />
          )}
        </div>
        <div className="border-t border-border bg-paper/50 px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 text-[12.5px] text-text-muted">
            <p>
              <span className="text-[15px] font-semibold tabular-nums text-text">{formatSgd(collectedCents)}</span> of{' '}
              {formatSgd(expectedCents)} collected
            </p>
            <p className="flex flex-wrap gap-x-5 gap-y-1">
              <Stat value={String(responses.length)} label={responses.length === 1 ? 'response' : 'responses'} href={`${base}&tab=responses`} />
              <Stat value={`${paid.length}/${charged.length}`} label="paid" href={`${base}&tab=payments&show=paid`} />
              <Stat value={String(toCheck.length)} label="to check" href={`${base}&tab=payments&show=check`} warn={toCheck.length > 0} />
            </p>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hover"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Share of fees collected"
          >
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Membership fee sections">
        {TABS.map((item) => {
          const count =
            item.key === 'responses' ? unmatched.length : item.key === 'payments' ? toCheck.length : 0
          return (
            <Link
              key={item.key}
              href={`${base}&tab=${item.key}`}
              aria-current={tab === item.key ? 'page' : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium ${
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

      {tab === 'form' && (
        <FormTab
          orgSlug={orgSlug}
          term={term}
          form={form}
          roster={await dbAs(userId, (tx) =>
            tx.member.findMany({
              where: { orgId: org.id, OR: [{ isActive: true }, { id: { in: form.recipientIds } }] },
              orderBy: { fullName: 'asc' },
              select: { id: true, fullName: true, studentId: true },
            })
          )}
        />
      )}

      {tab === 'responses' && (
        <div className="space-y-5">
          <Panel
            title="Responses"
            description="Everyone who has filled in the form. Anyone who wasn’t linked to the roster when they sent it waits here for you to match them or add them."
            actions={
              responses.length > 0 && (
                <a href={`/${orgSlug}/fees/collection/responses/export?term=${term.id}`} className={linkButtonClass('secondary')}>
                  Download spreadsheet
                </a>
              )
            }
          >
            <ResponsesList
              orgSlug={orgSlug}
              locked={term.closed}
              roster={unlinked.members}
              responses={responses.map(
                (row): ResponseView => ({
                  id: row.id,
                  email: row.email,
                  memberId: row.memberId,
                  memberName: row.memberName,
                  fullName: row.fullName,
                  studentId: row.studentId,
                  answers: row.answers,
                  held: row.held,
                  sentShort: row.submittedAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: SGT }),
                  sentLong: row.submittedAt.toLocaleString('en-SG', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: SGT,
                  }),
                  edited: row.updatedAt.getTime() - row.submittedAt.getTime() > 60_000,
                  matchedByName: row.matchedByName,
                  joiningAs: row.joiningAs,
                  graduationYear: row.graduationYear,
                  candidates: row.candidates,
                  idTakenBy: row.idTakenBy,
                })
              )}
            />
          </Panel>

          {unlinked.accounts.length > 0 && unlinked.members.length > 0 && (
            <Panel
              title="Signed in, but not on the roster"
              description="People are matched automatically when they sign in with the email on the roster, or their student-ID address (1001234@mymail.sutd.edu.sg). These signed in another way and haven’t filled in the form. Where they gave a student ID, the row is already picked."
            >
              <ul className="space-y-3">
                {unlinked.accounts.map((account) => (
                  <li key={account.userId}>
                    <LinkForm orgSlug={orgSlug} account={account} members={unlinked.members} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {tab === 'payments' && (
        <Panel
          title="Payments"
          description="Everyone on the roster and where their fee stands. Click a fee to change it, or tick several people to set theirs together. Nobody records or checks their own."
        >
          <FeeTable
            orgSlug={orgSlug}
            termId={term.id}
            closed={term.closed}
            rates={rates}
            rows={views}
            initialFilter={show && ['all', 'unpaid', 'check', 'paid', 'waived', 'attention'].includes(show) ? show : 'all'}
          />
        </Panel>
      )}

      {tab === 'deposit' && (
        <div className="space-y-5">
          <Panel
            title={term.closed ? (deposit ? 'Banked in' : 'Closed') : nothingToBank ? 'Before you close it' : 'Before you bank in'}
            description={
              nothingToBank
                ? 'Nothing has been paid through the OSL collection, so there’s no money to bank and no Income Deposit Form to raise. Closing still closes the form for good and freezes this term’s fees and payments.'
                : 'Banking in closes the form for good, freezes this term’s fees and payments, and raises the Income Deposit Form from what was paid through the OSL collection. It’s due at OSL one working day after the final collection.'
            }
          >
            <ul className="space-y-2 text-[13px]">
              <Check
                ok={toCheck.length === 0}
                text={toCheck.length === 0 ? 'No payments waiting to be checked' : `${toCheck.length} payment${toCheck.length === 1 ? '' : 's'} still to check`}
                href={toCheck.length ? `${base}&tab=payments&show=check` : undefined}
              />
              <Check
                ok={heldResponses.length === 0}
                text={
                  heldResponses.length > 0
                    ? 'Someone paid through the form and isn’t matched to the roster yet'
                    : 'Every payment sent through the form is on the roster'
                }
                href={heldResponses.length > 0 ? `${base}&tab=responses` : undefined}
              />
              <Check
                ok={totals.owedCents === 0}
                warnOnly
                text={
                  totals.owedCents === 0
                    ? 'Everybody charged has paid'
                    : `${charged.length - paid.length} still owe ${formatSgd(totals.owedCents)}. ${nothingToBank || (term.closed && !deposit) ? 'Closing' : 'Banking in'} leaves them owing.`
                }
              />
              <Check
                ok={Boolean(term.finalCollectionAt)}
                warnOnly
                text={term.finalCollectionAt ? `Final collection ${longDate(term.finalCollectionAt)}` : 'No final collection date, so today is used'}
              />
            </ul>
            <dl className="mt-4 grid max-w-[420px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
              {!(nothingToBank || (term.closed && !deposit)) && (
                <>
                  <dt className="text-text-muted">{term.closed ? 'Banked in' : 'To bank in'}</dt>
                  <dd className="m-0 text-right font-semibold tabular-nums">{formatSgd(totals.bankableCents)}</dd>
                  <dt className="text-text-muted">of which GST</dt>
                  <dd className="m-0 text-right tabular-nums">{formatSgd(split.gstCents)}</dd>
                </>
              )}
              {totals.confirmedCents > totals.bankableCents && (
                <>
                  <dt className="text-text-muted">Paid outside OSL</dt>
                  <dd className="m-0 text-right tabular-nums">{formatSgd(totals.confirmedCents - totals.bankableCents)}</dd>
                </>
              )}
            </dl>
            {!term.closed && (
              <div className="mt-4">
                <CloseButton
                  orgSlug={orgSlug}
                  termId={term.id}
                  bankable={formatSgd(totals.bankableCents)}
                  nothingToBank={nothingToBank}
                  blockedReason={closeBlockedReason}
                />
              </div>
            )}
          </Panel>

          {term.closed && !deposit && (
            <Panel
              id="deposit"
              title="No deposit form needed"
              description="Nothing came in through the OSL collection, so there was nothing to bank and nothing to send OSL. This term is finished."
            >
              <Link href={`/${orgSlug}/fees/collection/summary?term=${term.id}`} className={linkButtonClass('secondary')}>
                The club&rsquo;s own record of who paid
              </Link>
            </Panel>
          )}

          {deposit && (
            <Panel
              id="deposit"
              title="The Income Deposit Form"
              description="OSL’s own workbook with these figures filled in, grouped by fee rather than by person so no member names leave the club. Send it, then mark it as sent."
            >
              <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr]">
                <Row label="Reference" value={deposit.referenceNumber ?? '—'} mono />
                <Row label="WBS element" value={deposit.wbsElement} mono />
                <Row label="Gross collected" value={formatSgd(deposit.grossCents)} />
                <Row label="Net of GST" value={formatSgd(deposit.netCents)} />
                <Row label="GST" value={formatSgd(deposit.gstCents)} />
                {deposit.submissionDueAt && <Row label="Due at OSL" value={longDate(deposit.submissionDueAt)} />}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a href={`/${orgSlug}/fees/collection/deposit-form?term=${term.id}`} className={linkButtonClass('primary')}>
                  Download the spreadsheet
                </a>
                <Link href={`/${orgSlug}/fees/collection/deposit-form/print?term=${term.id}`} className={linkButtonClass('secondary')}>
                  Print it as a PDF
                </Link>
                <Link href={`/${orgSlug}/fees/collection/summary?term=${term.id}`} className={linkButtonClass('ghost')}>
                  The club&rsquo;s own record of who paid
                </Link>
              </div>
              <div className="mt-4">
                <FiledToggle orgSlug={orgSlug} termId={term.id} filed={deposit.submittedToOslAt !== null} />
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}

function FormTab({
  orgSlug,
  term,
  form,
  roster,
}: {
  orgSlug: string
  term: TermRow
  form: Awaited<ReturnType<typeof getForm>>
  roster: { id: string; fullName: string; studentId: string | null }[]
}) {
  return (
    <div className="space-y-5">
      {form.state === 'OPEN' && !term.closed && (
        <Notice tone="info">
          The form is open. Changes you save here reach everyone straight away, including people halfway through filling it in.
        </Notice>
      )}

      <Panel
        title="1. Fees and dates"
        description="What each fee costs this term. To charge someone differently, set their fee under Payments. OSL want two weeks’ notice before the collection opens."
      >
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
      </Panel>

      <Panel
        title="2. PayNow QR"
        description="A new QR is made for each collection. It’s shown on the form, beside the amount to pay."
      >
        <QrForm
          orgSlug={orgSlug}
          termId={term.id}
          termName={term.name}
          hasQr={term.hasPaynowQr}
          uploadedAt={term.paynowQrUploadedAt}
          locked={term.closed}
        />
      </Panel>

      <Panel
        title="3. Who gets this form"
        description="Usually everyone. Pick particular people for a form that's only for a few, like the rare half-term joiners."
      >
        <AudiencePicker
          orgSlug={orgSlug}
          termId={term.id}
          audience={form.audience}
          chosen={form.recipientIds}
          roster={roster}
          locked={term.closed}
        />
      </Panel>

      <Panel title="4. Welcome note">
        <FormSettings orgSlug={orgSlug} termId={term.id} intro={form.intro} locked={term.closed} />
      </Panel>

      <Panel
        title="5. Your own questions"
        description="Anything else the club wants to know this term: Telegram handle, shirt size, which classes they can make."
        actions={
          <Link href={`/${orgSlug}/fees?term=${term.id}&preview=1`} className={linkButtonClass('secondary', 'sm')}>
            Preview the form
          </Link>
        }
      >
        <QuestionList orgSlug={orgSlug} termId={term.id} questions={form.questions} locked={term.closed} />
      </Panel>

      <Panel title="Always on the form" description="These are part of every membership form, so they can’t be removed.">
        <ul className="grid gap-2 text-[13px] text-text sm:grid-cols-2">
          <Fixed title="Who they are" detail="Name and student ID are filled from the signed-in account or roster, and the member can correct them before sending." />
          <Fixed title="Their fee" detail="The term's full fee, or what you set for that person under Payments. Nobody picks their own." />
          <Fixed title="Paying" detail="The QR, the exact amount, the PayNow reference and a screenshot." />
          <Fixed title="What happens next" detail="Their payment comes to Payments for someone else in the exco to check." />
        </ul>
      </Panel>

      <details className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
        <summary className="cursor-pointer text-[15px] font-semibold">Start a new term</summary>
        <div className="mt-4">
          <NewTermForm
            orgSlug={orgSlug}
            suggestion={suggestNextTerm(term.endDate)}
            previousTerm={{
              id: term.id,
              fullFeeCents: term.fullFeeCents,
              halfFeeCents: term.halfFeeCents,
              exchangeFeeCents: term.exchangeFeeCents,
            }}
          />
        </div>
      </details>
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
    hasProof: row.hasProof,
    declaredOn: row.declaredAt
      ? row.declaredAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: SGT })
      : null,
    rejectedReason: row.rejectedReason,
    hasAccount: row.hasAccount,
    isYou: row.isYou,
    declaredByYou: row.declaredByUserId === userId,
  }
}

function sgDate(value: Date): string {
  return value.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', timeZone: SGT })
}

function Stat({ value, label, href, warn }: { value: string; label: string; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="underline-offset-4 hover:underline">
      <span className={`font-semibold tabular-nums ${warn ? 'text-warning' : 'text-text'}`}>{value}</span> {label}
    </Link>
  )
}

function Fixed({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="rounded-[var(--radius-sm)] border border-border bg-paper/50 px-3.5 py-2.5">
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">{detail}</p>
    </li>
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

/** The first standard trimester that begins after the current term ends. */
function suggestNextTerm(currentEnd: Date): { name: string; startDate: string; endDate: string } {
  const end = fromDateColumn(currentEnd)
  const cursor = new Date(end.getFullYear(), end.getMonth(), 1)
  for (let i = 0; i < 15; i++) {
    cursor.setMonth(cursor.getMonth() + 1)
    const suggestion = suggestTerm(cursor)
    const [year, month, day] = suggestion.startDate.split('-').map(Number)
    if (new Date(year, month - 1, day) > end) return suggestion
  }
  throw new Error('Could not suggest the next term')
}

function iso(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
