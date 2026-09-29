'use client'

import { useActionState, useRef, useState } from 'react'
import { uploadPaynowQr } from '@/modules/fees/collection-actions'
import { type FeeState } from '@/modules/fees/action-state'
import { Button } from '@/core/ui/button'

/**
 * The PayNow QR for this collection.
 *
 * A fresh QR is generated per collection, so this is on the collection screen
 * rather than in organisation settings. Replacing it is expected, not an
 * exception — but it is a different act from the first upload, so the wording
 * changes and the member-facing consequence is spelled out.
 */
export function QrForm({
  orgSlug,
  termId,
  termName,
  hasQr,
  uploadedAt,
  locked,
}: {
  orgSlug: string
  termId: string
  termName: string
  hasQr: boolean
  uploadedAt: Date | null
  /** Closed and banked in. The code that was collected on stands. */
  locked: boolean
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    uploadPaynowQr.bind(null, orgSlug),
    { error: null }
  )
  const [chosen, setChosen] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cache-busted so a replaced QR is visibly replaced here, rather than the
  // treasurer seeing the old one and uploading a third time.
  const src = `/${orgSlug}/fees/qr/${termId}?v=${uploadedAt?.getTime() ?? 0}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-5">
        {hasQr ? (
          <div className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`PayNow QR currently shown for ${termName}`}
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
            No QR yet. Members see the amount but no way to pay it.
          </div>
        )}

        <div className="min-w-[18rem] flex-1 space-y-3">
          <p className="max-w-[58ch] text-[13px] leading-relaxed text-text-muted">
            {hasQr
              ? 'Replacing this changes what every member sees from the moment you save. Anybody who paid against the old code has already paid — their declaration still stands.'
              : 'Save the QR out of the banking app rather than photographing the screen. Members scan this off their own phone, and a photograph of a screen often will not read.'}
          </p>

          {state.error && (
            <p className="text-[12.5px] leading-relaxed text-danger" role="alert">
              {state.error}
            </p>
          )}
          {state.ok && !state.error && (
            <p className="text-[12.5px] text-success" role="status">
              Saved. Members see it now.
            </p>
          )}

          {!locked && (
            <form action={formAction} className="space-y-2.5">
              <input type="hidden" name="termId" value={termId} />
              <input
                ref={inputRef}
                type="file"
                name="qr"
                accept="image/png,image/jpeg"
                required
                onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)}
                className="block w-full text-[12.5px] text-text-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-text hover:file:bg-surface-hover"
              />
              <Button type="submit" size="sm" loading={pending} disabled={!chosen}>
                {hasQr ? 'Replace the QR' : 'Put the QR up'}
              </Button>
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
