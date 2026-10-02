import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { dbAs, inTurn } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { loadMonthDocuments, withSignature, SignatureUnavailableError } from '@/modules/coach-claim/documents'
import { MonthNotFrozenError } from '@/modules/coach-claim/snapshot'
import { InvoicePreview } from '@/modules/coach-claim/preview/invoice-preview'
import { AttendanceSheetPreview } from '@/modules/coach-claim/preview/attendance-preview'
import { formatSgd } from '@/modules/coach-claim/money'
import { MONTHS, longDate } from '@/modules/coach-claim/theme'
import { NO_OFFICE } from '@/modules/coach-claim/documents'
import { OFFICE_LABELS } from '@/core/access'
import { SignPanel } from './_components/sign-panel'
import { SendPanel } from './_components/send-panel'
import { VoidPanel } from './_components/void-panel'
import { coachPaymentEmail } from '@/modules/coach-claim/osl-email'
import { PaidToggle } from '../_components/paid-toggle'

export const dynamic = 'force-dynamic'

export default async function MonthDocumentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; invoiceId: string }>
}) {
  const { orgSlug, invoiceId } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'claim.generate')
  const { userId, name: viewerName } = await verifySession()

  const loaded = await dbAs(userId, async (tx) => {
    // A month raised before the portal started freezing them cannot be
    // reproduced as it was issued, and rendering today's rows in its place
    // would be worse than saying so.
    const documents = await loadMonthDocuments(tx, { orgId: org.id, invoiceId }).catch(
      (error) => {
        if (error instanceof MonthNotFrozenError) return 'NOT_FROZEN' as const
        throw error
      }
    )
    if (documents === 'NOT_FROZEN') return 'NOT_FROZEN' as const
    if (!documents) return null

    const [user, settings, membership, monthInvoices, voiding] = await inTurn([
      tx.user.findUnique({ where: { id: userId }, select: { signatureImagePath: true } }),
      tx.organisationSettings.findUnique({
        where: { orgId: org.id },
        select: { submissionEmail: true, oslContactName: true },
      }),
      tx.organisationMembership.findUnique({
        where: { userId_orgId: { userId, orgId: org.id } },
        select: { office: true },
      }),
      // Every coach billed for this month, for the one email that carries them all.
      tx.invoice.findMany({
        where: {
          orgId: org.id,
          periodYear: documents.summary.periodYear,
          periodMonth: documents.summary.periodMonth,
          status: { not: 'VOID' },
        },
        orderBy: { documentNo: 'asc' },
        select: { instructor: { select: { fullName: true, shortCode: true } } },
      }),
      tx.invoice.findFirst({
        where: { id: invoiceId, orgId: org.id },
        select: { voidedAt: true, referenceNumber: { select: { voidReason: true } } },
      }),
    ])
    return {
      documents,
      hasSpecimen: Boolean(user?.signatureImagePath),
      submissionEmail: settings?.submissionEmail ?? null,
      oslContactName: settings?.oslContactName ?? null,
      monthCoaches: monthInvoices.map((row) => row.instructor),
      viewerOffice: membership?.office ?? null,
      voidedAt: voiding?.voidedAt ?? null,
      voidReason: voiding?.referenceNumber?.voidReason ?? null,
    }
  })

  if (!loaded) notFound()

  if (loaded === 'NOT_FROZEN') {
    return (
      <div className="mx-auto max-w-[720px] space-y-4">
        <PageHeader
          breadcrumbItems={[
            { label: org.name, href: `/${orgSlug}/dashboard` },
            { label: 'Monthly run', href: `/${orgSlug}/monthly-run` },
            { label: 'Unavailable' },
          ]}
          title="That month cannot be reproduced"
        />
        <Card>
          <CardContent className="py-6 text-[13.5px] leading-relaxed text-text-muted">
            It was raised before the portal started keeping a copy of the month as it stood, so
            its documents can only be rebuilt from rows that have since moved. Void it and
            raise it again to get documents that will still be the same next year.
          </CardContent>
        </Card>
      </div>
    )
  }

  const withStamp = await withSignature(loaded.documents).catch((error) => {
    if (error instanceof SignatureUnavailableError) return null
    throw error
  })
  if (!withStamp) {
    const { summary: brief } = loaded.documents
    return (
      <div className="mx-auto max-w-[720px] space-y-4">
        <PageHeader
          breadcrumbItems={[
            { label: org.name, href: `/${orgSlug}/dashboard` },
            { label: 'Coach payments', href: `/${orgSlug}/monthly-run` },
            { label: `${brief.instructorName}, ${MONTHS[brief.periodMonth - 1]} ${brief.periodYear}` },
          ]}
          title="The signature didn’t load"
        />
        <Card>
          <CardContent className="space-y-3 py-6 text-[13.5px] leading-relaxed text-text-muted">
            <p>
              This month was signed, but the stored signature couldn&rsquo;t be fetched just now. The
              documents aren&rsquo;t shown without it, so nobody downloads a copy with an empty
              signature line.
            </p>
            <Link
              href={`/${orgSlug}/monthly-run/${invoiceId}`}
              className="inline-block font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              Try again
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }
  const { summary, invoice, sheet } = withStamp
  const monthHref = `/${orgSlug}/monthly-run?month=${summary.periodYear}-${String(summary.periodMonth).padStart(2, '0')}`
  const period = `${MONTHS[summary.periodMonth - 1]} ${summary.periodYear}`
  const signed = Boolean(summary.verifiedAt)
  const submitted = Boolean(summary.submittedToOslAt)
  // The last thing that happens to a month, and the only part of it the
  // portal cannot observe: the money moves in OSL's accounts.
  const paid = summary.status === 'PAID'

  const { subject, body } = coachPaymentEmail({
    periodYear: summary.periodYear,
    periodMonth: summary.periodMonth,
    coaches: loaded.monthCoaches,
  })

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          {
            label: 'Coach payments',
            href: monthHref,
          },
          { label: `${summary.instructorName}, ${period}` },
        ]}
        title={`${period} — ${summary.instructorName}`}
        subtitle={
          summary.status === 'VOID'
            ? 'A voided month, kept as the record of its reference number. The documents below are what was raised.'
            : 'Read both documents, sign them, then send them. What is on screen is what is in the files: the same rows render the preview, the print sheet and the two downloads.'
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
          <dl className="flex flex-wrap gap-x-7 gap-y-2 text-[13px]">
            <Fact label="Reference" value={summary.referenceNumber} mono />
            <Fact label="Invoice" value={summary.documentNo} mono />
            <Fact label="Amount" value={formatSgd(summary.totalCents)} />
            <Fact
              label="Fund"
              value={summary.fundSource === 'SEED' ? 'Seed Fund' : 'Income'}
            />
            {summary.submissionDueAt && !submitted && (
              <Fact label="Due" value={longDate(summary.submissionDueAt)} />
            )}
          </dl>
          <Badge variant={summary.status === 'VOID' ? 'neutral' : submitted ? 'success' : signed ? 'neutral' : 'warning'}>
            {summary.status === 'VOID' ? 'Void' : submitted ? 'Sent' : signed ? 'Signed, not sent' : 'Awaiting signature'}
          </Badge>
        </CardContent>
      </Card>

      {summary.status === 'VOID' && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="text-[14px] font-semibold">
              {summary.referenceNumber} was voided
              {loaded.voidedAt ? ` on ${longDate(loaded.voidedAt)}` : ''}
            </p>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
              {loaded.voidReason ? <>&ldquo;{loaded.voidReason}&rdquo; </> : null}
              It stays here as a record of the number, and it no longer counts toward the fund or
              the month. Nothing on this page can be signed or sent.
            </p>
            <Link href={monthHref} className="inline-block text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline">
              Back to {period}
            </Link>
          </CardContent>
        </Card>
      )}

      {summary.status !== 'VOID' && (
        <Step n={1} title="Read what you are signing">
        <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
          The invoice is the coach&rsquo;s own document, billed to the university in their
          name. The attendance sheet is the club&rsquo;s, and it is the evidence the invoice
          rests on &mdash; every billed date on one is a coach-led date on the other.
        </p>
        </Step>
      )}

      <section aria-label="Invoice" className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Invoice &middot; issued by {summary.instructorName}
        </h2>
        <InvoicePreview data={invoice} />
      </section>

      <section aria-label="Attendance sheet" className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Attendance sheet &middot; {org.name}
        </h2>
        <AttendanceSheetPreview data={sheet} />
      </section>

      {summary.status !== 'VOID' && (
        <>
      <Step n={2} title={signed ? 'Signed' : 'Verify and countersign'}>
        <SignPanel
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          hasSpecimen={loaded.hasSpecimen}
          signedBy={summary.verifiedByName}
          signedOn={summary.verifiedAt ? longDate(summary.verifiedAt) : null}
          // Once signed, the post that was recorded. Before, the post the
          // reader actually holds — which is not always Treasurer, and which
          // may be none at all. Showing "Treasurer" to somebody who is about
          // to print "Exco member" under their own signature is the one
          // mismatch this panel exists to prevent.
          office={
            signed
              ? (sheet.verification?.office ?? NO_OFFICE)
              : loaded.viewerOffice
                ? OFFICE_LABELS[loaded.viewerOffice]
                : NO_OFFICE
          }
          hasOffice={signed ? true : loaded.viewerOffice !== null}
          viewerName={viewerName}
          submitted={submitted}
        />
      </Step>

      <Step n={3} title={submitted ? 'Sent' : 'Send to the Office of Student Life'} muted={!signed}>
        {signed && !summary.stamped && (
          <p className="max-w-[68ch] rounded-[var(--radius-sm)] border border-warning/25 bg-warning/8 p-3 text-[13.5px] leading-relaxed">
            This month was verified without a stored signature, so both documents carry an
            empty rule. <strong className="font-semibold">Sign the printout by hand</strong>{' '}
            before you attach it &mdash; the portal has recorded who stood behind the month,
            but the copy that reaches the Office of Finance has to show it.
          </p>
        )}
        {signed ? (
          <SendPanel
            orgSlug={orgSlug}
            invoiceId={invoiceId}
            toName={loaded.oslContactName}
            to={loaded.submissionEmail}
            coachCount={loaded.monthCoaches.length}
            subject={subject}
            body={body}
            submittedOn={
              summary.submittedToOslAt ? longDate(summary.submittedToOslAt) : null
            }
          />
        ) : (
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
            Available once the month is signed.
          </p>
        )}
      </Step>

      <Step n={4} title={paid ? 'Paid' : 'Paid by OSL'} muted={!submitted}>
        {submitted ? (
          <>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
              {paid
                ? `Recorded as paid. If that turns out to be wrong, take it back — nothing else depends on it.`
                : `OSL pay on their own schedule and the portal cannot see their accounts, so this is yours to say. Until it is said, the month stays on the board as still owed.`}
            </p>
            <PaidToggle
              orgSlug={orgSlug}
              invoiceId={invoiceId}
              coachName={summary.instructorName}
              paid={paid}
            />
          </>
        ) : (
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
            Nothing to record until the month has gone to OSL.
          </p>
        )}
      </Step>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="text-[15px] font-semibold">Something wrong with it?</h2>
          <VoidPanel
            orgSlug={orgSlug}
            invoiceId={invoiceId}
            reference={summary.referenceNumber}
            sent={submitted}
            paid={paid}
          />
        </CardContent>
      </Card>
        </>
      )}

      {summary.status !== 'VOID' && (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-[13px]">
          <span className="text-text-subtle">The editable files, if you need them:</span>
          <DocLink href={`/${orgSlug}/monthly-run/${invoiceId}/download/invoice.docx`}>
            Invoice .docx
          </DocLink>
          <DocLink
            href={`/${orgSlug}/monthly-run/${invoiceId}/download/attendance-sheet.docx`}
          >
            Attendance sheet .docx
          </DocLink>
        </CardContent>
      </Card>
      )}
    </div>
  )
}

function Step({
  n,
  title,
  muted,
  children,
}: {
  n: number
  title: string
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex gap-4">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
              muted ? 'bg-surface-hover text-text-subtle' : 'bg-accent-50 text-accent-700'
            }`}
          >
            {n}
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.1em] text-text-subtle">{label}</dt>
      <dd className={`m-0 mt-0.5 font-medium tabular-nums ${mono ? 'font-mono text-[12.5px]' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="font-medium text-accent-600 underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  )
}
