'use client'

import { useActionState, useState } from 'react'
import { markSubmitted } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'

/**
 * Sending is still a person writing an email.
 *
 * The portal hands over the signed PDF and the words to send with it, and the
 * treasurer sends from the club's own address — the one OSL already replies
 * to, with a sent-items folder somebody can check. It never sends on anybody's
 * behalf.
 */
export function SendPanel({
  orgSlug,
  invoiceId,
  toName,
  to,
  coachCount,
  subject,
  body,
  submittedOn,
}: {
  orgSlug: string
  invoiceId: string
  toName: string | null
  to: string | null
  coachCount: number
  subject: string
  body: string
  submittedOn: string | null
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    async () => markSubmitted(orgSlug, invoiceId),
    { error: null }
  )

  return (
    <div className="space-y-5">
      {state.error && <Problem>{state.error}</Problem>}

      {submittedOn ? (
        <p className="text-[13.5px] leading-relaxed">
          Marked as sent on <strong className="font-semibold">{submittedOn}</strong>.
        </p>
      ) : (
        <ol className="max-w-[68ch] space-y-2 pl-5 text-[13.5px] leading-relaxed text-text-muted [&>li]:list-decimal">
          <li>Download the signed PDF: the invoice and the attendance sheet, in one file.</li>
          <li>
            {coachCount > 1
              ? `Email it to ${toName ?? 'OSL'} with the other coaches' PDFs for the month, using the message below.`
              : `Email it to ${toName ?? 'OSL'} using the message below.`}
          </li>
          <li>Mark it as sent, so the deadline stops counting.</li>
        </ol>
      )}

      <dl className="grid max-w-[760px] gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr]">
        <dt className="pt-1 text-text-subtle">To</dt>
        <dd className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          {to ? (
            <>
              <span className="font-medium">
                {toName ? `${toName} ` : ''}
                <span className={toName ? 'text-text-muted' : ''}>{toName ? `(${to})` : to}</span>
              </span>
              <CopyButton text={to} label="Copy address" />
            </>
          ) : (
            <span className="text-text-muted">
              No OSL representative is set. Add one in Settings → Organisation.
            </span>
          )}
        </dd>
        <dt className="pt-1 text-text-subtle">Subject</dt>
        <dd className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{subject}</span>
          <CopyButton text={subject} label="Copy subject" />
        </dd>
        <dt className="pt-1 text-text-subtle">Message</dt>
        <dd className="m-0 space-y-2">
          <pre className="whitespace-pre-wrap rounded-[var(--radius-sm)] border border-border bg-surface-hover/50 p-3 font-sans text-[13px] leading-relaxed text-text">
            {body}
          </pre>
          <CopyButton text={body} label="Copy message" />
        </dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <DownloadPdf href={`/${orgSlug}/monthly-run/${invoiceId}/pdf`} />
        {!submittedOn && (
          <form action={submit}>
            <Button type="submit" loading={pending}>
              Mark as sent
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * Fetched rather than linked: Chromium takes a few seconds to print the pack,
 * and a plain link gives no sign anything is happening until the file lands.
 */
function DownloadPdf({ href }: { href: string }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setProblem(null)
    try {
      const response = await fetch(href)
      if (!response.ok) {
        setProblem((await response.text()) || 'The PDF could not be made. Try again.')
        return
      }
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'Coach payment.pdf'
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setProblem('The PDF could not be made. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={download} loading={busy}>
        {busy ? 'Preparing the PDF…' : 'Download signed PDF'}
      </Button>
      {problem && <Problem>{problem}</Problem>}
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-[12.5px] font-medium text-accent-600 underline-offset-4 hover:underline"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
      role="alert"
    >
      {children}
    </div>
  )
}
