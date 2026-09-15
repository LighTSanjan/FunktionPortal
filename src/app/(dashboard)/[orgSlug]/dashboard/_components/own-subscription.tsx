import Link from 'next/link'
import type { OwnFee } from '@/modules/fees/queries'
import { formatSgd } from '@/modules/coach-claim/money'

/**
 * What this person owes the club, on the screen they land on.
 *
 * For an ordinary member this is the whole reason to open the portal, and the
 * home screen used to leave it out entirely — it offered to widen their
 * access and nothing else. For an exco member it is the one thing of their own
 * in a screen full of the club's, and there was no route to it at all: the
 * sidebar hides "Your membership fee" from the exco so it is not confused with
 * the collection they run.
 *
 * Quiet when there is nothing to do, so an exco member who has paid does not
 * carry a reminder around on their work screen.
 */
export function OwnSubscription({
  orgSlug,
  fee,
  claimedStudentId,
  alwaysShow,
  delayMs = 0,
}: {
  orgSlug: string
  fee: OwnFee
  claimedStudentId: string | null
  /** Members see the card even when settled; the exco only when it needs them. */
  alwaysShow: boolean
  delayMs?: number
}) {
  const href = `/${orgSlug}/fees`
  const state = describe(fee, claimedStudentId)
  if (!state.needsYou && !alwaysShow) return null

  return (
    <section
      className="rise-in flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[var(--radius-lg)] border border-border bg-surface px-5 py-4"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
      aria-labelledby="own-subscription"
    >
      <div className="min-w-0">
        <h2
          id="own-subscription"
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle"
        >
          Your membership fee{fee.term ? ` · ${fee.term.name}` : ''}
        </h2>
        <p className="mt-1 text-[15px] font-semibold text-text">{state.headline}</p>
        {state.detail && (
          <p className="mt-0.5 max-w-[60ch] text-[12.5px] leading-relaxed text-text-muted">
            {state.detail}
          </p>
        )}
      </div>
      {state.action && (
        <Link
          href={href}
          className={`shrink-0 rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-medium ${
            state.needsYou
              ? 'bg-accent-600 text-white hover:bg-accent-700'
              : 'text-accent-600 underline-offset-4 hover:underline'
          }`}
        >
          {state.action}
        </Link>
      )}
    </section>
  )
}

function describe(
  fee: OwnFee,
  claimed: string | null
): { headline: string; detail?: string; action?: string; needsYou: boolean } {
  if (!fee.member) {
    return claimed
      ? {
          headline: 'Waiting for the exco to match you to the roster',
          detail: `You gave your student ID as ${claimed}. Once they confirm it, what you owe shows here.`,
          action: 'Change it',
          needsYou: false,
        }
      : {
          headline: 'Tell the club your student ID',
          detail: 'Your account is not matched to the roster yet, so the portal cannot tell what you owe.',
          action: 'Give your student ID',
          needsYou: true,
        }
  }
  if (!fee.term) {
    return { headline: 'No collection is open', detail: 'Nothing to pay until the exco open one.', needsYou: false }
  }
  if (fee.owesNothing) {
    return {
      headline: fee.tier === 'WAIVED' ? 'Your fee is waived this term' : 'Nothing to pay this term',
      needsYou: false,
    }
  }

  const amount = formatSgd(fee.amountCents)
  switch (fee.payment?.status) {
    case 'CONFIRMED':
      return { headline: `${amount} paid`, detail: 'Thank you! Nothing more to do.', needsYou: false }
    case 'DECLARED':
      return {
        headline: `${amount} — waiting on the exco`,
        detail: 'You have said you paid. Somebody checks it against the bank statement.',
        action: 'See it',
        needsYou: false,
      }
    case 'REJECTED':
      return {
        headline: 'Your payment could not be matched',
        detail: fee.payment.rejectedReason ?? undefined,
        action: 'Sort it out',
        needsYou: true,
      }
    default: {
      const due = fee.term.finalCollectionAt
        ? ` by ${fee.term.finalCollectionAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'long' })}`
        : ''
      return {
        headline: `${amount} due${due}`,
        detail: fee.term.closed
          ? 'This collection has closed. Speak to the treasurer.'
          : fee.term.hasPaynowQr
            ? 'Pay by PayNow, then let us know.'
            : 'The PayNow QR for this collection is not up yet.',
        action: fee.term.closed ? undefined : 'Pay now',
        needsYou: !fee.term.closed,
      }
    }
  }
}
