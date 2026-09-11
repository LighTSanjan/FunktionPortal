'use client'

import { useActionState, useRef, useState } from 'react'
import { uploadSignature, removeSignature, type SignatureState } from '@/modules/signatures/actions'
import { Button } from '@/core/ui/button'

export function SignatureForm({
  orgSlug,
  currentUrl,
  updatedAt,
}: {
  orgSlug: string
  /** Short-lived signed URL for the specimen already on file. */
  currentUrl: string | null
  updatedAt: string | null
}) {
  const [state, formAction, pending] = useActionState<SignatureState, FormData>(
    uploadSignature.bind(null, orgSlug),
    { error: null }
  )
  const [removeState, removeAction, removing] = useActionState<SignatureState, FormData>(
    async () => removeSignature(orgSlug),
    { error: null }
  )
  // Shown before uploading, because the thing that goes wrong with a
  // signature photograph is the framing, and nobody can tell from a filename.
  const [chosen, setChosen] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const error = state.error ?? removeState.error

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
          role="alert"
        >
          {error}
        </div>
      )}

      {currentUrl && !chosen && (
        <figure className="m-0">
          <div className="inline-flex items-end rounded-[var(--radius-sm)] border border-border bg-white px-4 py-3">
            {/* Signed URLs are generated per request, so they cannot use a
                static Next image allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt="Your signature as it will be stamped" className="h-[46px]" />
          </div>
          {updatedAt && (
            <figcaption className="mt-1.5 text-[12px] text-text-subtle">
              Uploaded {updatedAt}
            </figcaption>
          )}
        </figure>
      )}

      {chosen && (
        <figure className="m-0">
          <div className="inline-flex items-end rounded-[var(--radius-sm)] border border-accent-300 bg-white px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={chosen} alt="The signature you are about to upload" className="h-[46px]" />
          </div>
          <figcaption className="mt-1.5 text-[12px] text-text-subtle">
            Not saved yet — this is how it will sit on the signature line.
          </figcaption>
        </figure>
      )}

      <form action={formAction} className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          name="signature"
          accept="image/png,image/jpeg"
          required
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            setChosen(file ? URL.createObjectURL(file) : null)
          }}
          className="block w-full text-[13px] text-text-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-text hover:file:bg-surface-hover"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={pending}>
            {currentUrl ? 'Replace signature' : 'Upload signature'}
          </Button>
          {currentUrl && (
            <Button type="submit" variant="ghost" form="remove-signature" loading={removing}>
              Remove
            </Button>
          )}
        </div>
      </form>

      {/* A separate form so the remove button does not carry the file input. */}
      <form id="remove-signature" action={removeAction} />

      {state.ok && !state.error && (
        <p className="text-[13px] text-success" role="status">
          Saved. It will be stamped on the documents you sign from now on.
        </p>
      )}
      {removeState.ok && !removeState.error && (
        <p className="text-[13px] text-text-muted" role="status">
          Removed. Documents will print an empty rule for a handwritten signature.
        </p>
      )}
    </div>
  )
}
