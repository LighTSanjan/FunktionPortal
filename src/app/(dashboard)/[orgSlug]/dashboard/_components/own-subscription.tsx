import Link from 'next/link'
import type { OwnFee } from '@/modules/fees/queries'
import { formatSgd } from '@/modules/coach-claim/money'
import { buttonVariants } from '@/core/ui/button-variants'

/**
 * What this person owes the club, on the screen they land on.
 *
 * For an ordinary member this is the whole reason to open the portal, and the
 * home screen used to leave it out entirely — it offered to widen their
 * access and nothing else. For an exco member it is the one thing of their own
 * in a screen full of the club's.
 *
 * Quiet when there is nothing to do, so an exco member who has paid does not
 * carry a reminder around on their work screen.
 */
export function OwnSubscription({
  orgSlug,
  fee,
  alwaysShow,
  delayMs = 0,
}: {
  orgSlug: string
  fee: OwnFee
  /** Members see the card even when settled; the exco only when it needs them. */
  alwaysShow: boolean
  delayMs?: number
}) {
  const href = `/${orgSlug}/fees`
  const state = describe(fee)
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
          className={`shrink-0 ${buttonVariants({ variant: state.needsYou ? 'primary' : 'secondary' })}`}
        >
          {state.action}
        </Link>
      )}
    </section>
  )
}

function describe(
  fee: OwnFee
): { headline: string; detail?: string; action?: string; needsYou: boolean } {
  if (!fee.term) {
    return { headline: 'No membership form right now', detail: 'Nothing to do until the exco start a term.', needsYou: false }
  }
  const open = fee.form?.state === 'OPEN' && !fee.term.closed

  if (!fee.response && fee.form && !fee.form.forYou && !fee.payment) {
    return { headline: 'No membership form for you right now', needsYou: false }
  }

  if (!fee.response) {
    if (open && fee.form?.forYou) {
      return {
        headline: `The ${fee.term.name} membership form is open`,
        detail: 'Fill it in and pay your fee. It takes two minutes.',
        action: 'Fill it in',
        needsYou: true,
      }
    }
    if (!fee.member || fee.payment === null) {
      return {
        headline: fee.form?.state === 'CLOSED' || fee.term.closed ? 'The membership form is closed' : 'The membership form isn’t open yet',
        detail: fee.form?.state === 'DRAFT' ? 'The link goes up in the Telegram group when it opens.' : undefined,
        needsYou: false,
      }
    }
  }

  if (!fee.member) {
    return {
      headline: 'Waiting for the exco to put you on the roster',
      detail: fee.response?.heldPayment
        ? 'Your response and payment are in. They check the payment once you’re on the roster.'
        : 'Your response is in. Nothing for you to do.',
      action: 'See it',
      needsYou: false,
    }
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
      return { headline: `${amount} paid`, detail: 'Thank you! See you next session.', needsYou: false }
    case 'DECLARED':
      return {
        headline: `${amount} — being checked`,
        detail: 'Somebody in the exco matches it to the bank statement.',
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
        detail: fee.term.closed ? 'This collection has closed. Speak to the treasurer.' : 'Pay by PayNow, then let us know.',
        action: fee.term.closed ? undefined : 'Pay now',
        needsYou: !fee.term.closed,
      }
    }
  }
}
