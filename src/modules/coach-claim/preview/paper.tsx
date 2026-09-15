/**
 * The shell every document preview is drawn on.
 *
 * Deliberately not themed. The app follows the reader's light/dark choice;
 * a document does not — it is a rendering of a sheet of paper that will be
 * printed and sent to the Office of Finance, and showing it in dark mode
 * would be showing something the recipient will never see.
 */
import type { ReactNode } from 'react'
import { INK, INK_SOFT, RULE, HEADER_FILL } from '../theme'

/** Shared with the .docx builders, so a palette change moves both at once. */
export const PAPER = {
  ink: `#${INK}`,
  inkSoft: `#${INK_SOFT}`,
  rule: `#${RULE}`,
  headerFill: `#${HEADER_FILL}`,
  /** The instructor row's tint on the attendance grid. */
  instructorFill: '#FCEBD2',
} as const

export function Paper({
  children,
  landscape,
}: {
  children: ReactNode
  /** Matches the .docx page orientation, which widens past five class dates. */
  landscape?: boolean
}) {
  return (
    <div
      data-print="sheet"
      data-orientation={landscape ? 'landscape' : 'portrait'}
      className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-[var(--sunk,#F1EFEA)] p-3 sm:p-5"
    >
      <div
        className="mx-auto bg-white px-[6%] py-[5%] shadow-[0_1px_2px_rgba(23,25,43,.06),0_12px_36px_-20px_rgba(23,25,43,.45)]"
        style={{
          color: PAPER.ink,
          fontFamily: 'Calibri, Carlito, "Segoe UI", system-ui, sans-serif',
          // A4 proportions, so the preview breaks in the same places the
          // printed sheet does.
          width: landscape ? 1050 : 760,
          maxWidth: '100%',
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** A label above a block, matching the docx's small caps run. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      className="m-0 mb-1.5 font-semibold uppercase"
      style={{ color: PAPER.inkSoft, fontSize: 9, letterSpacing: '.1em' }}
    >
      {children}
    </p>
  )
}

/** "Label:  value" — the labelled fact the documents use throughout. */
export function Fact({
  label,
  value,
  align,
}: {
  label: string
  value: ReactNode
  align?: 'right'
}) {
  return (
    <p
      className="m-0 mb-0.5"
      style={{ fontSize: 11, textAlign: align === 'right' ? 'right' : undefined }}
    >
      <span style={{ color: PAPER.inkSoft }}>{label}:&nbsp;&nbsp;</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </p>
  )
}

export function Hairline({ className }: { className?: string }) {
  return <div className={className} style={{ borderTop: `1px solid ${PAPER.rule}` }} />
}

/**
 * The signature, or the space left for one.
 *
 * The specimen is inlined rather than fetched: this page is server-rendered
 * to a reader who has already been authorised for it, so there is no signed
 * URL to leak and nothing extra to expire. Absent, the gap is drawn at the
 * same height so the preview shows the rule the wet signature would go on.
 */
export function SignatureStamp({
  signature,
  name,
}: {
  signature?: { data: Buffer; format: 'png' | 'jpg' }
  name: string
}) {
  if (!signature) return <div style={{ height: 46 }} />
  return (
    <div style={{ height: 46, display: 'flex', alignItems: 'flex-end' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/${signature.format === 'jpg' ? 'jpeg' : 'png'};base64,${signature.data.toString('base64')}`}
        alt={`Signature of ${name}`}
        style={{ maxHeight: 46, maxWidth: 150, objectFit: 'contain' }}
      />
    </div>
  )
}
