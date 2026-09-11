'use client'

import { useActionState, useEffect, useState } from 'react'
import { uploadSignature, removeSignature, type SignatureState } from '@/modules/signatures/actions'
import { readBackground, liftInk, type BackgroundReading } from '@/modules/signatures/clean'
import { Button } from '@/core/ui/button'

/** What the box on the document is, so the preview is the real size. */
const STAMP_HEIGHT = 46

interface Prepared {
  /** As uploaded, re-encoded at a sane size. */
  originalUrl: string
  originalBlob: Blob
  /** Paper lifted off. Null when there was nothing to lift. */
  cleanedUrl: string | null
  cleanedBlob: Blob | null
  reading: BackgroundReading
  width: number
  height: number
}

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

  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [useCleaned, setUseCleaned] = useState(true)
  const [reading, setReading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const error = localError ?? state.error ?? removeState.error

  // Object URLs outlive the component unless they are let go of.
  useEffect(() => {
    return () => {
      if (prepared) {
        URL.revokeObjectURL(prepared.originalUrl)
        if (prepared.cleanedUrl) URL.revokeObjectURL(prepared.cleanedUrl)
      }
    }
  }, [prepared])

  async function choose(file: File | undefined) {
    setLocalError(null)
    if (!file) {
      setPrepared(null)
      return
    }
    setReading(true)
    try {
      setPrepared(await prepare(file))
      setUseCleaned(true)
    } catch {
      setLocalError('That image could not be read. It has to be a PNG or a JPEG.')
      setPrepared(null)
    } finally {
      setReading(false)
    }
  }

  /**
   * Submit what the preview shows, never the file the browser holds.
   *
   * The cleaning happens here, in front of the person whose signature it is,
   * so they can see what will be stamped and refuse it — doing it on the
   * server would mean silently altering somebody's signature. Submitting the
   * rendered blob either way also means a phone photograph has already been
   * brought down to a sane size, rather than being refused by the upload
   * limit for a reason that reads as "your signature is wrong".
   */
  function submit(formData: FormData) {
    if (prepared) {
      const blob = useCleaned && prepared.cleanedBlob ? prepared.cleanedBlob : prepared.originalBlob
      const extension = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      formData.set('signature', new File([blob], `signature.${extension}`, { type: blob.type }))
    }
    return formAction(formData)
  }

  const showing = prepared
    ? useCleaned && prepared.cleanedUrl
      ? prepared.cleanedUrl
      : prepared.originalUrl
    : null

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

      {currentUrl && !prepared && (
        <Stamped
          src={currentUrl}
          alt="Your signature as it will be stamped"
          caption={updatedAt ? `Uploaded ${updatedAt}` : undefined}
        />
      )}

      {reading && <p className="text-[13px] text-text-muted">Reading the image…</p>}

      {prepared && showing && (
        <div className="space-y-3">
          <Stamped
            src={showing}
            alt="The signature you are about to upload"
            caption="Not saved yet — this is how it will sit on the signature line."
            pending
          />

          {prepared.reading.photographed && prepared.cleanedUrl ? (
            <div className="space-y-2 rounded-[var(--radius-sm)] border border-border bg-paper px-3.5 py-3">
              <p className="max-w-[64ch] text-[12.5px] leading-relaxed text-text-muted">
                This looks like a photograph of paper. Left as it is, the paper comes with it and
                the document gets a coloured rectangle sitting over the signature line. The ink
                has been lifted off it below — compare the two and pick.
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Choice on={useCleaned} onClick={() => setUseCleaned(true)}>
                  Ink only
                </Choice>
                <Choice on={!useCleaned} onClick={() => setUseCleaned(false)}>
                  Photograph as taken
                </Choice>
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-text-subtle">
              Clean capture — nothing to lift off. {prepared.width}×{prepared.height}.
            </p>
          )}
        </div>
      )}

      <form action={submit} className="space-y-3">
        <input
          type="file"
          name="signature"
          accept="image/png,image/jpeg"
          required
          onChange={(e) => void choose(e.currentTarget.files?.[0])}
          className="block w-full text-[13px] text-text-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-text hover:file:bg-surface-hover"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={pending} disabled={reading}>
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

/** The specimen over a rule, at the height the document gives it. */
function Stamped({
  src,
  alt,
  caption,
  pending,
}: {
  src: string
  alt: string
  caption?: string
  pending?: boolean
}) {
  return (
    <figure className="m-0">
      <div
        className={`inline-block rounded-[var(--radius-sm)] border bg-white px-4 pb-2 pt-3 ${
          pending ? 'border-accent-300' : 'border-border'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} style={{ height: STAMP_HEIGHT }} className="block" />
        <div className="mt-1 h-px w-[180px] bg-[#333]" />
        <p className="mt-1 text-[9px] uppercase tracking-wider text-[#555]">Signature</p>
      </div>
      {caption && <figcaption className="mt-1.5 text-[12px] text-text-subtle">{caption}</figcaption>}
    </figure>
  )
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
        on
          ? 'border-accent-500 bg-accent-50 text-accent-700'
          : 'border-border bg-surface text-text-muted hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Decode the chosen file, read its background and produce the lifted version.
 *
 * Also caps the long side. A modern phone photograph is several thousand
 * pixels across, which is megabytes of PNG for an image that is rendered
 * 150 pixels wide — and the upload limit would refuse it for a reason the
 * person would read as "your signature is wrong".
 */
const MAX_SIDE = 1200

/** Comfortably inside the server's 2 MB limit, with room for the multipart. */
const SIZE_BUDGET = 1_700_000

async function prepare(file: File): Promise<Prepared> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('no canvas')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const image = context.getImageData(0, 0, width, height)
  const reading = readBackground(image.data, width, height)

  // The original is re-encoded rather than passed through: PNG keeps whatever
  // transparency a digital capture has, and a photograph that comes out large
  // as PNG is better sent as the JPEG it already was.
  let originalBlob = await toPng(canvas)
  if (originalBlob.size > SIZE_BUDGET) originalBlob = await toJpeg(canvas)
  const originalUrl = URL.createObjectURL(originalBlob)

  if (!reading.photographed) {
    return { originalUrl, originalBlob, cleanedUrl: null, cleanedBlob: null, reading, width, height }
  }

  liftInk(image.data, reading)
  context.putImageData(image, 0, 0)
  const cleanedBlob = await toPng(canvas)

  return {
    originalUrl,
    originalBlob,
    cleanedUrl: URL.createObjectURL(cleanedBlob),
    cleanedBlob,
    reading,
    width,
    height,
  }
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return encode(canvas, 'image/png')
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return encode(canvas, 'image/jpeg', 0.9)
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('no blob'))),
      type,
      quality
    )
  })
}
