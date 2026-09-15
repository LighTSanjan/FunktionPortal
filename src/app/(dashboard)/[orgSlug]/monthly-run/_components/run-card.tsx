'use client'

import * as React from 'react'
import Link from 'next/link'
import { useActionState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/core/ui/button'
import { Badge } from '@/core/ui/badge'
import { Select } from '@/core/ui/select'
import { formatSgd, formatHours } from '@/modules/coach-claim/money'
import { generateMonthlyDocuments } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import type { RunEntry } from '@/modules/coach-claim/monthly-run'
import { PaidToggle } from './paid-toggle'
import { DownloadPdf } from './download-pdf'

const STATUS: Record<RunEntry['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  READY: { label: 'Ready to raise', variant: 'info' },
  BLOCKED: { label: 'Blocked', variant: 'danger' },
  NO_SESSIONS: { label: 'No classes', variant: 'neutral' },
  GENERATED: { label: 'Awaiting signature', variant: 'warning' },
  SIGNED: { label: 'Signed, not sent', variant: 'info' },
  SUBMITTED: { label: 'With OSL', variant: 'success' },
  PAID: { label: 'Paid', variant: 'success' },
  VOID: { label: 'Void', variant: 'neutral' },
}

export function RunCard({
  orgSlug,
  period,
  entry,
  funds,
  delayMs = 0,
}: {
  orgSlug: string
  period: string
  entry: RunEntry
  /** What each fund has left, before this claim. */
  funds: { source: string; remainingCents: number }[]
  delayMs?: number
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    generateMonthlyDocuments.bind(null, orgSlug),
    { error: null }
  )

  const raised =
    entry.status === 'GENERATED' ||
    entry.status === 'SIGNED' ||
    entry.status === 'SUBMITTED' ||
    entry.status === 'PAID'
  const invoiceId = entry.invoiceId ?? ''
  const status = STATUS[entry.status]

  const overdue =
    (entry.status === 'GENERATED' || entry.status === 'SIGNED') &&
    entry.submissionDueAt !== null &&
    entry.submissionDueAt < new Date()

  return (
    <article
      className="rise-in overflow-hidden rounded-[var(--radius-lg)] border border-brand-ink bg-surface"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-text">
            {entry.fullName}
            {!entry.isActive && <span className="ml-2 text-[12px] font-medium text-text-subtle">No longer coaching</span>}
          </p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            {entry.sessionCount} {entry.sessionCount === 1 ? 'class' : 'classes'} ·{' '}
            {formatHours(entry.totalMinutes)} hr
            {entry.subtotalCents > 0 && ` · ${formatSgd(entry.subtotalCents)}`}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="px-5 py-4">
        {entry.status === 'BLOCKED' && (
          <div className="space-y-2">
            <p className="text-[13.5px] text-danger">
              Cannot be raised — no {entry.blockers.join(', ')}.
            </p>
            <Link
              href={`/${orgSlug}/instructors/${entry.instructorId}`}
              className="inline-block text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              Open {entry.fullName.split(/\s+/)[0]}&rsquo;s record
            </Link>
          </div>
        )}

        {entry.status === 'READY' && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="instructorId" value={entry.instructorId} />
            <input type="hidden" name="period" value={period} />

            {state.error && (
              <div
                className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
                role="alert"
              >
                {state.error}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[220px] flex-1">
                <span className="mb-1.5 block text-[12.5px] font-medium text-text">
                  Which fund it draws on
                </span>
                {/* Seed first: it does not roll over and it stops accepting
                    submissions in February, so spending it before the income
                    fund is the only ordering that never loses money. */}
                <Select name="fundSource" defaultValue="SEED">
                  {funds.map((fund) => (
                    <option key={fund.source} value={fund.source}>
                      {fund.source === 'SEED' ? 'OSL Seed Fund' : 'Income'} —{' '}
                      {formatSgd(fund.remainingCents)} left
                    </option>
                  ))}
                </Select>
              </label>

              <Button type="submit" loading={pending}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Raise the month
              </Button>
            </div>

            <p className="text-[12px] leading-relaxed text-text-subtle">
              {entry.voided.length > 0
                ? 'Raising it again gives the new documents the next IV reference number. The voided one keeps its number, with its reason.'
                : 'This allocates the next IV reference number. The number is issued once and kept even if the invoice is later voided, so a gap in the series stays answerable.'}
            </p>
          </form>
        )}

        {raised && invoiceId && (
          <div className="space-y-3">
            <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px]">
              <div>
                <dt className="text-text-subtle">Reference</dt>
                <dd className="font-mono text-[13px] text-text">{entry.referenceNumber}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Invoice no.</dt>
                <dd className="font-mono text-[13px] text-text">{entry.documentNo}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Fund</dt>
                <dd className="text-[13px] text-text">
                  {entry.fundSource === 'SEED' ? 'OSL Seed Fund' : 'Income'}
                </dd>
              </div>
              {entry.submissionDueAt && !entry.submittedToOslAt && (
                <div>
                  <dt className="text-text-subtle">Due at OSL</dt>
                  <dd className={`text-[13px] ${overdue ? 'font-semibold text-danger' : 'text-text'}`}>
                    {entry.submissionDueAt.toLocaleDateString('en-SG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'Asia/Singapore',
                    })}
                    {overdue && ' — passed'}
                  </dd>
                </div>
              )}
            </dl>

            {/* One way in. Reading, signing and sending happen on the month's
                own page, so there is no route to recording a month as sent
                that skips looking at what is being sent. */}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${orgSlug}/monthly-run/${invoiceId}`}
                className="lapis-press lapis-tap inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-4 text-[13px] font-medium text-text hover:bg-surface-hover"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {entry.status === 'GENERATED'
                  ? 'Read and sign'
                  : entry.status === 'SIGNED'
                    ? 'Send to OSL'
                    : 'Open the documents'}
              </Link>
              {/* One file with both: they are only ever sent together. Signed
                  months get the PDF OSL asks for; before that, the Word file. */}
              {entry.status === 'GENERATED' ? (
                <DownloadLink href={`/${orgSlug}/monthly-run/${invoiceId}/download/month.docx`}>
                  Invoice + attendance sheet (.docx)
                </DownloadLink>
              ) : (
                <DownloadPdf href={`/${orgSlug}/monthly-run/${invoiceId}/pdf`} label="Invoice + attendance sheet (PDF)" />
              )}
            </div>

            {/* The last step, and the only one the portal cannot observe for
                itself: the money moves in OSL's accounts. */}
            {(entry.status === 'SUBMITTED' || entry.status === 'PAID') && (
              <PaidToggle
                orgSlug={orgSlug}
                invoiceId={invoiceId}
                coachName={entry.fullName}
                paid={entry.status === 'PAID'}
              />
            )}
          </div>
        )}

        {/* The numbers this month has already spent, and why. Kept visible so
            a gap in the IV series is answered where somebody would look. */}
        {entry.voided.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-border pt-3 text-[12.5px] text-text-muted">
            {entry.voided.map((old) => (
              <li key={old.invoiceId}>
                <Link
                  href={`/${orgSlug}/monthly-run/${old.invoiceId}`}
                  className="font-mono text-[12px] text-text-subtle line-through underline-offset-4 hover:underline"
                >
                  {old.referenceNumber ?? 'Unnumbered'}
                </Link>{' '}
                voided{old.reason ? `: ${old.reason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download
      className="lapis-press lapis-tap inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-4 text-[13px] font-medium text-text hover:bg-surface-hover"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </a>
  )
}
