'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signMonth, withdrawSignature } from '@/modules/coach-claim/run-actions'
import type { ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'

/**
 * The step where somebody puts their name to the month.
 *
 * Deliberately at the foot of the two documents rather than beside them: the
 * button that stamps a signature should be the thing you reach after reading,
 * not the thing you reach past.
 */
export function SignPanel({
  orgSlug,
  invoiceId,
  hasSpecimen,
  signedBy,
  signedOn,
  office,
  viewerName,
  hasOffice,
  submitted,
}: {
  orgSlug: string
  invoiceId: string
  hasSpecimen: boolean
  signedBy: string | null
  signedOn: string | null
  /** Once signed, the post recorded. Before, the post that would be. */
  office: string
  /** Who is looking at this, for the same reason. */
  viewerName: string
  /** False when they hold no named post in the club. */
  hasOffice: boolean
  submitted: boolean
}) {
  const [state, sign, pending] = useActionState<ActionState, FormData>(
    async () => signMonth(orgSlug, invoiceId),
    { error: null }
  )
  const [withdrawState, withdraw, withdrawing] = useActionState<ActionState, FormData>(
    async () => withdrawSignature(orgSlug, invoiceId),
    { error: null }
  )

  const error = state.error ?? withdrawState.error

  if (signedBy) {
    return (
      <div className="space-y-3">
        {error && <Problem>{error}</Problem>}
        <p className="text-[13.5px] leading-relaxed">
          Verified and countersigned by <strong className="font-semibold">{signedBy}</strong>
          {signedOn ? `, ${office.toLowerCase()}, on ${signedOn}` : ''}.
        </p>
        {!submitted && (
          <form action={withdraw}>
            <Button type="submit" variant="ghost" loading={withdrawing}>
              Withdraw the signature
            </Button>
          </form>
        )}
      </div>
    )
  }

  return (
    <form action={sign} className="space-y-3">
      {error && <Problem>{error}</Problem>}
      <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
        Signing attests two things at once: that the classes above are the ones that ran, and
        that the club stands behind the coach&rsquo;s invoice. Both documents carry the same
        name and post, because it is one statement by one person.
      </p>
      {/* Stated rather than left to be inferred from the preview: the office
          is whatever post you actually hold, which is not always Treasurer,
          and it is what prints under the signature. */}
      <p className="text-[13.5px] leading-relaxed">
        You will sign as <strong className="font-semibold">{viewerName}</strong>,{' '}
        {office.toLowerCase()}.
      </p>
      {!hasOffice && (
        <p className="max-w-[68ch] rounded-[var(--radius-sm)] border border-warning/25 bg-warning/8 p-3 text-[13px] leading-relaxed">
          You hold no named post in the club, so that is what the documents will say. The
          guidelines have the Treasurer verify the sheet &mdash; if that is you, have an exco
          member set your office in{' '}
          <Link
            href={`/${orgSlug}/settings/access`}
            className="font-medium underline underline-offset-4"
          >
            access settings
          </Link>{' '}
          first.
        </p>
      )}
      {!hasSpecimen && (
        <p className="max-w-[68ch] rounded-[var(--radius-sm)] border border-warning/25 bg-warning/8 p-3 text-[13px] leading-relaxed">
          You have no signature on file, so the documents will record you as the verifier and
          still print an empty rule to sign by hand.{' '}
          <Link
            href={`/${orgSlug}/settings/profile`}
            className="font-medium underline underline-offset-4"
          >
            Upload one
          </Link>{' '}
          if you would rather it were stamped.
        </p>
      )}
      <Button type="submit" loading={pending}>
        {hasSpecimen ? 'Sign both documents' : 'Verify without a stamp'}
      </Button>
    </form>
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
