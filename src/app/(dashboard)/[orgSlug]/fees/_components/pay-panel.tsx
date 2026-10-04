'use client'

import { useState } from 'react'
import { Button } from '@/core/ui/button'
import { DeclareForm } from './declare-form'

/**
 * Scan, pay, tell us — in that order, with the form hidden until step three.
 *
 * With the form open under the QR it reads as two things to do at once, and
 * people fill it in before they have paid.
 */
export function PayPanel({
  orgSlug,
  termId,
  termName,
  amount,
  qrSrc,
  redeclaring,
}: {
  orgSlug: string
  termId: string
  termName: string
  amount: string
  /** The full- or half-term QR, whichever matches what they owe. */
  qrSrc: string | null
  redeclaring: boolean
}) {
  const [telling, setTelling] = useState(false)

  return (
    <div className="space-y-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-start gap-5">
        {qrSrc ? (
          // Streamed by a route that re-checks membership, never cached: a QR
          // replaced mid-collection must not keep resolving to the old code.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrSrc}
            alt={`PayNow QR for the ${termName} membership fee`}
            className="h-[180px] w-[180px] shrink-0 rounded-[var(--radius-sm)] border border-border bg-white object-contain p-2"
          />
        ) : (
          <div className="flex h-[180px] w-[180px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 text-center text-[12px] leading-relaxed text-text-subtle">
            The PayNow QR isn&rsquo;t up yet. Ask the treasurer, and don&rsquo;t reuse last term&rsquo;s.
          </div>
        )}
        <ol className="min-w-[14rem] flex-1 space-y-2.5 text-[13.5px] leading-relaxed">
          <Step n={1}>Scan the QR in your banking app.</Step>
          <Step n={2}>
            Pay exactly <span className="font-semibold tabular-nums">{amount}</span>.
          </Step>
          <Step n={3}>Tell us you&rsquo;ve paid, with a screenshot of the confirmation.</Step>
        </ol>
      </div>

      {telling ? (
        <DeclareForm orgSlug={orgSlug} termId={termId} amount={amount} redeclaring={redeclaring} />
      ) : (
        <Button type="button" onClick={() => setTelling(true)}>
          {redeclaring ? 'Send it again' : 'I’ve paid'}
        </Button>
      )}
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-semibold text-accent-700">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}
