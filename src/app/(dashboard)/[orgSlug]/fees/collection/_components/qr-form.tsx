'use client'

import { useActionState, useRef, useState } from 'react'
import { removeHalfPaynowQr, uploadPaynowQr } from '@/modules/fees/collection-actions'
import { type FeeState } from '@/modules/fees/action-state'
import { Button } from '@/core/ui/button'

/**
 * The PayNow QRs for this collection: the full-term one, which the form needs,
 * and an optional half-term one. Each can have its amount fixed inside it, so
 * half-rate members are shown the half-term QR when there is one.
 *
 * A fresh QR is generated per collection, so this is on the collection screen
 * rather than in organisation settings.
 */
export function QrForm({
  orgSlug,
  termId,
  termName,
  fullFee,
  halfFee,
  hasQr,
  uploadedAt,
  hasHalfQr,
  halfUploadedAt,
  locked,
}: {
  orgSlug: string
  termId: string
  termName: string
  /** The rates, formatted, so each QR says which amount it is for. */
  fullFee: string
  halfFee: string
  hasQr: boolean
  uploadedAt: Date | null
  hasHalfQr: boolean
  halfUploadedAt: Date | null
  /** Closed and banked in. The code that was collected on stands. */
  locked: boolean
}) {
  return (
    <div className="space-y-6">
      <QrSlot
        orgSlug={orgSlug}
        termId={termId}
        termName={termName}
        rate="full"
        heading={`Full term · ${fullFee}`}
        lead="Required. Every member sees this one, unless the half-term QR below fits what they owe."
        hasQr={hasQr}
        uploadedAt={uploadedAt}
        locked={locked}
      />
      <div className="border-t border-border pt-6">
        <QrSlot
          orgSlug={orgSlug}
          termId={termId}
          termName={termName}
          rate="half"
          heading={`Half term · ${halfFee}`}
          lead={`Optional. Shown instead to members who owe ${halfFee}. Without it they get the full-term QR, so if that one has ${fullFee} fixed in it, put this one up too.`}
          hasQr={hasHalfQr}
          uploadedAt={halfUploadedAt}
          locked={locked}
        />
      </div>
    </div>
  )
}

/**
 * One QR. Replacing it is expected, not an exception, but it is a different
 * act from the first upload, so the wording changes and the member-facing
 * consequence is spelled out.
 */
function QrSlot({
  orgSlug,
  termId,
  termName,
  rate,
  heading,
  lead,
  hasQr,
  uploadedAt,
  locked,
}: {
  orgSlug: string
  termId: string
  termName: string
  rate: 'full' | 'half'
  heading: string
  lead: string
  hasQr: boolean
  uploadedAt: Date | null
  locked: boolean
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    uploadPaynowQr.bind(null, orgSlug),
    { error: null }
  )
  const [removeState, removeAction, removing] = useActionState<FeeState, FormData>(
    () => removeHalfPaynowQr(orgSlug, termId),
    { error: null }
  )
  const [chosen, setChosen] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cache-busted so a replaced QR is visibly replaced here, rather than the
  // treasurer seeing the old one and uploading a third time.
  const src = `/${orgSlug}/fees/qr/${termId}?${rate === 'half' ? 'rate=half&' : ''}v=${uploadedAt?.getTime() ?? 0}`
  const error = state.error ?? removeState.error
  const headingId = `qr-${rate}-heading`

  return (
    <div role="group" aria-labelledby={headingId} className="space-y-3">
      <div>
        <p id={headingId} className="text-[13.5px] font-semibold text-text">{heading}</p>
        <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-text-muted">{lead}</p>
      </div>
      <div className="flex flex-wrap items-start gap-5">
        {hasQr ? (
          <div className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${rate === 'half' ? 'Half-term' : 'Full-term'} PayNow QR currently shown for ${termName}`}
              className="h-[150px] w-[150px] rounded-[var(--radius-sm)] border border-border bg-white object-contain p-1.5"
            />
            {uploadedAt && (
              <p className="text-[11.5px] text-text-subtle">
                {/* Singapore time on both sides: the server and the browser
                    otherwise disagree about the day, and React throws the
                    server's render away over it. */}
                Up since {uploadedAt.toLocaleDateString('en-SG', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'Asia/Singapore',
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-[150px] w-[150px] items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-border-strong px-3 text-center text-[11.5px] leading-relaxed text-text-subtle">
            {rate === 'half' ? 'None. Half-rate members get the full-term QR.' : 'No QR yet. Members see the amount but no way to pay it.'}
          </div>
        )}

        <div className="min-w-[18rem] flex-1 space-y-3">
          <p className="max-w-[58ch] text-[13px] leading-relaxed text-text-muted">
            {hasQr
              ? `Replacing this changes what ${rate === 'half' ? 'half-rate members see' : 'every member sees'} from the moment you save. Anybody who paid against the old code has already paid — their declaration still stands.`
              : 'Save the QR out of the banking app rather than photographing the screen. Members scan this off their own phone, and a photograph of a screen often will not read.'}
          </p>

          {error && (
            <p className="text-[12.5px] leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          {state.ok && !error && (
            <p className="text-[12.5px] text-success" role="status">
              Saved. Members see it now.
            </p>
          )}

          {!locked && (
            <form action={formAction} className="space-y-2.5">
              <input type="hidden" name="termId" value={termId} />
              <input type="hidden" name="rate" value={rate} />
              <input
                ref={inputRef}
                type="file"
                name="qr"
                accept="image/png,image/jpeg"
                required
                onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)}
                className="block w-full text-[12.5px] text-text-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-text hover:file:bg-surface-hover"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={pending} disabled={!chosen}>
                  {hasQr ? 'Replace the QR' : 'Put the QR up'}
                </Button>
                {rate === 'half' && hasQr && (
                  <Button type="submit" size="sm" variant="secondary" formAction={removeAction} formNoValidate loading={removing}>
                    Take it down
                  </Button>
                )}
              </div>
            </form>
          )}

          {locked && (
            <p className="text-[12.5px] leading-relaxed text-text-subtle">
              This collection is closed. The code it was collected on stands.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
