import Link from 'next/link'
import { dbAs } from '@/core/db'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { hasPermission } from '@/core/permissions'
import { studentIdFromEmail } from '@/core/auth/roster-match'
import { PageHeader } from '@/core/ui/page-header'
import { Badge } from '@/core/ui/badge'
import { currentTerm, getTerm, listOwnTerms, type OwnTerm } from '@/modules/fees/queries'
import { amountForTier, resolveFee, TIER_LABEL } from '@/modules/fees/tiers'
import { formatSgd } from '@/modules/coach-claim/money'
import { formIsFor, getForm, getOwnResponse } from '@/modules/membership-form/queries'
import { answerText } from '@/modules/membership-form/questions'
import { MembershipForm, type MembershipFormProps } from './_components/membership-form'
import { PayPanel } from './_components/pay-panel'
import { Notice, linkButtonClass, pillClass } from './_components/ui'

export const dynamic = 'force-dynamic'

const SGT = 'Asia/Singapore'

/**
 * The membership form, from the member's side — and every exco member's too,
 * because they join and pay like anybody else.
 *
 * One of four things: the form isn't open yet; the form, to fill in; what you
 * sent and where your payment stands; or the form has closed.
 */
export default async function FeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ term?: string; preview?: string; edit?: string; sent?: string }>
}) {
  const { orgSlug } = await params
  const query = await searchParams
  const { org, membership } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'fee.declare')
  const { userId } = await verifySession()
  const canManage = hasPermission(membership.role, 'fee.manage')
  const preview = canManage && Boolean(query.preview)

  const [ownTerms, picked] = await Promise.all([
    listOwnTerms(userId, org.id),
    query.term ? getTerm(userId, org.id, query.term) : currentTerm(userId, org.id),
  ])
  // Between terms with nothing coming up, the last term they took part in
  // rather than a blank page.
  const fallback = !picked && !query.term && ownTerms[0] ? await getTerm(userId, org.id, ownTerms[0].id) : null
  const term = picked ?? fallback

  const header = (
    <>
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Your membership fee' },
        ]}
        title="Your membership"
        actions={
          canManage ? (
            <Link
              href={`/${orgSlug}/fees/collection${term ? `?term=${term.id}` : ''}`}
              className={linkButtonClass('secondary')}
            >
              Everyone&rsquo;s fees
            </Link>
          ) : undefined
        }
      />
      {!preview && <TermSwitcher orgSlug={orgSlug} terms={ownTerms} showing={term?.id ?? null} />}
    </>
  )

  if (!term) {
    return (
      <Shell header={header}>
        <Hero title="No membership form right now" line="The exco haven’t started a term yet." />
      </Shell>
    )
  }

  const [form, response, context] = await Promise.all([
    getForm(userId, org.id, term.id),
    getOwnResponse(userId, org.id, term.id),
    dbAs(userId, async (tx) => {
      const [user, member] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, select: { email: true } }),
        tx.member.findFirst({
          where: { orgId: org.id, userId },
          select: { id: true, fullName: true, studentId: true, rosterLabel: true, isActive: true },
        }),
      ])
      const key = member ? { termId_memberId: { termId: term.id, memberId: member.id } } : null
      const charge =
        key && term.chargesRecorded
          ? await tx.termCloseCharge.findUnique({ where: key, select: { tier: true, amountCents: true } })
          : null
      const [payment, arrangement] = key
        ? await Promise.all([
            tx.feePayment.findUnique({
              where: key,
              select: { status: true, tier: true, amountCents: true, rejectedReason: true, confirmedAt: true },
            }),
            tx.feeArrangement.findUnique({ where: key, select: { tier: true, amountCents: true, note: true } }),
          ])
        : [null, null]
      return { email: user?.email ?? '', member, payment, arrangement, charge }
    }),
  ])
  const { member, payment, arrangement, charge } = context

  // What they owe. Never their choice: the term's rate, or what the exco set
  // for this person.
  const rates = term
  // In preview the exco can see the form as somebody who is not on the roster.
  const asMember = preview && query.preview === 'new' ? null : member
  let fee: MembershipFormProps['fee']
  if (asMember && term.chargesRecorded) {
    // Closed: what they were charged when it closed, whatever the roster says now.
    fee = charge && charge.amountCents > 0
      ? { amountCents: charge.amountCents, label: TIER_LABEL[charge.tier], note: null }
      : { amountCents: 0, label: 'Not taking part this term', note: null }
  } else if (asMember && arrangement) {
    fee = {
      amountCents: amountForTier(arrangement.tier, rates, arrangement.amountCents),
      label: TIER_LABEL[arrangement.tier],
      note: arrangement.note ? `Set by the exco: ${arrangement.note}` : 'Set by the exco.',
    }
  } else if (asMember) {
    const roster = resolveFee({ payment: null, arrangement: null, rosterLabel: asMember.rosterLabel, isActive: asMember.isActive, rates })
    fee = roster.charged
      ? { amountCents: roster.amountCents, label: TIER_LABEL[roster.tier], note: null }
      : { amountCents: 0, label: 'Not taking part this term', note: 'If that’s wrong, tell the treasurer before you pay.' }
  } else {
    fee = {
      amountCents: amountForTier('FULL', rates),
      label: TIER_LABEL.FULL,
      note: 'Joining for less than a full term? Tell the treasurer before you pay, and they’ll set your fee.',
    }
  }

  const paymentState: MembershipFormProps['payment'] = preview && !asMember
    ? 'NONE'
    : (asMember ? payment?.status : undefined) ?? (response?.held ? 'HELD' : 'NONE')

  const due = term.finalCollectionAt?.toLocaleDateString('en-SG', { day: 'numeric', month: 'long' })
  const formOpen = form.state === 'OPEN' && !term.closed
  const editing = Boolean(query.edit) && formOpen && response !== null

  const formProps: MembershipFormProps = {
    orgSlug,
    termId: term.id,
    termName: term.name,
    questions: form.questions,
    rosterName: asMember ? { fullName: asMember.fullName, studentId: asMember.studentId } : null,
    lockedStudentId: asMember ? null : studentIdFromEmail(context.email),
    fee,
    payment: paymentState,
    hasQr: term.hasPaynowQr,
    previous: editing && response ? response : null,
    preview,
  }

  const heroLine = term.closed
    ? 'This term’s collection has closed.'
    : form.state === 'OPEN'
      ? due
        ? `Open until ${due}`
        : 'Open for responses'
      : form.state === 'CLOSED'
        ? 'The form is closed'
        : 'Not open yet'

  if (preview) {
    return (
      <Shell header={header}>
        <Notice
          tone="warning"
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/${orgSlug}/fees?term=${term.id}&preview=${query.preview === 'new' ? '1' : 'new'}`}
                className={linkButtonClass('secondary', 'sm')}
              >
                {query.preview === 'new' ? 'See it as yourself' : 'See it as someone new'}
              </Link>
              <Link href={`/${orgSlug}/fees/collection?term=${term.id}&tab=form`} className={linkButtonClass('secondary', 'sm')}>
                Back to editing
              </Link>
            </div>
          }
        >
          <span className="font-semibold">Preview.</span> This is the form{' '}
          {query.preview === 'new' ? 'as someone who isn’t on the roster sees it' : 'as you would see it'}. Nothing sends.
        </Notice>
        <Hero title={`${term.name} membership`} line={heroLine} intro={form.intro} />
        <MembershipForm {...formProps} />
      </Shell>
    )
  }

  if (!response && !formIsFor(form, member?.id ?? null)) {
    return (
      <Shell header={header}>
        <Hero title={`${term.name} membership`} line={heroLine} />
        <section className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
          <p className="text-[15px] font-semibold text-text">There&rsquo;s no form for you right now</p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            This term&rsquo;s form went to particular people. If you think you should have it, speak to the treasurer.
          </p>
        </section>
      </Shell>
    )
  }

  if (formOpen && (!response || editing)) {
    return (
      <Shell header={header}>
        <Hero title={`${term.name} membership`} line={heroLine} intro={form.intro} />
        {editing && (
          <Notice
            action={
              <Link href={`/${orgSlug}/fees?term=${term.id}`} className={linkButtonClass('ghost', 'sm')}>
                Cancel
              </Link>
            }
          >
            Changing the response you sent. Your payment stays as it is.
          </Notice>
        )}
        <MembershipForm {...formProps} />
      </Shell>
    )
  }

  if (!response) {
    const closedLine =
      form.state === 'DRAFT'
        ? 'The exco haven’t opened it yet. The link goes up in the Telegram group when they do.'
        : 'It isn’t taking responses any more. If you still need to join or pay for this term, speak to the treasurer.'
    return (
      <Shell header={header}>
        <Hero title={`${term.name} membership`} line={heroLine} />
        <section className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
          <p className="text-[15px] font-semibold text-text">
            {form.state === 'DRAFT' ? 'The form isn’t open yet' : 'The form is closed'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{closedLine}</p>
          {member && payment && payment.status !== 'REJECTED' && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[13px]">
              <span>
                Your fee: <span className="font-semibold tabular-nums">{formatSgd(payment.amountCents)}</span>
                <span className="text-text-muted"> · {TIER_LABEL[payment.tier]}</span>
              </span>
              <StatusBadge status={payment.status} owes={payment.amountCents > 0} />
            </div>
          )}
          {member && payment?.status === 'REJECTED' && !term.closed && (
            <div className="mt-4">
              <Notice tone="danger">
                The exco couldn&rsquo;t match your payment: <strong>{payment.rejectedReason}</strong>
              </Notice>
              <PayPanel
                orgSlug={orgSlug}
                termId={term.id}
                termName={term.name}
                amount={formatSgd(payment.amountCents)}
                hasQr={term.hasPaynowQr}
                redeclaring
              />
            </div>
          )}
        </section>
        {canManage && form.state === 'DRAFT' && (
          <Notice
            action={
              <Link href={`/${orgSlug}/fees/collection?term=${term.id}&tab=form`} className={linkButtonClass('secondary', 'sm')}>
                Set it up
              </Link>
            }
          >
            You&rsquo;re in the exco: open the form from Membership fees, then fill it in here like everyone else.
          </Notice>
        )}
      </Shell>
    )
  }

  const onRoster = Boolean(member)
  const amountCents = payment?.amountCents ?? response.held?.amountCents ?? fee.amountCents
  const status = payment?.status ?? (response.held ? 'HELD' : null)

  return (
    <Shell header={header}>
      <Hero title={`${term.name} membership`} line={heroLine} />

      {query.sent && (
        <Notice tone="success" role="status">
          Sent! {status === 'CONFIRMED' ? 'See you next session!' : 'Thanks for joining FUNKtion this term.'}
        </Notice>
      )}

      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-text">
              {status === 'CONFIRMED' ? `You’re in for ${term.name}` : 'We’ve got your response'}
            </p>
            <p className="mt-0.5 text-[12.5px] text-text-muted">
              Sent {response.submittedAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', timeZone: SGT })}
            </p>
          </div>
          <StatusBadge status={status} owes={amountCents > 0} />
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-border pt-4 text-[13px] sm:grid-cols-[9rem_1fr]">
          <dt className="text-text-subtle">Roster</dt>
          <dd className="m-0 text-text">
            {onRoster ? `On the roster as ${member!.fullName}` : 'An exco member will add you to the roster. Nothing for you to do.'}
          </dd>
          <dt className="text-text-subtle">Fee</dt>
          <dd className="m-0 text-text">
            {amountCents > 0 ? (
              <>
                <span className="font-semibold tabular-nums">{formatSgd(amountCents)}</span>
                <span className="text-text-muted"> · {payment ? TIER_LABEL[payment.tier] : fee.label}</span>
              </>
            ) : (
              'Nothing to pay'
            )}
          </dd>
          <dt className="text-text-subtle">Payment</dt>
          <dd className="m-0 text-text">
            {paymentLine(status, amountCents, payment?.confirmedAt ?? null, payment?.rejectedReason ?? null)}
          </dd>
          {response.answers.map((answer) => (
            <Answer key={answer.questionId} label={answer.label} value={answerText(answer.value) || '—'} />
          ))}
        </dl>

        {formOpen && (
          <div className="mt-4 border-t border-border pt-4">
            <Link href={`/${orgSlug}/fees?term=${term.id}&edit=1`} className={linkButtonClass('secondary')}>
              Edit your response
            </Link>
          </div>
        )}
      </section>

      {member && !term.closed && amountCents > 0 && (status === null || status === 'REJECTED') && (
        <section className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
          <p className="text-[15px] font-semibold text-text">{status === 'REJECTED' ? 'Send your payment again' : 'Pay your fee'}</p>
          <PayPanel
            orgSlug={orgSlug}
            termId={term.id}
            termName={term.name}
            amount={formatSgd(amountCents)}
            hasQr={term.hasPaynowQr}
            redeclaring={status === 'REJECTED'}
          />
        </section>
      )}
    </Shell>
  )
}

/**
 * The terms somebody can look back at. Shown only when there is somewhere
 * else to go: one term needs no switcher.
 */
function TermSwitcher({ orgSlug, terms, showing }: { orgSlug: string; terms: OwnTerm[]; showing: string | null }) {
  if (terms.length === 0 || (terms.length === 1 && terms[0].id === showing)) return null
  return (
    <nav aria-label="Your terms" className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium text-text-subtle">Your terms</span>
      {terms.map((term) => (
        <Link
          key={term.id}
          href={`/${orgSlug}/fees?term=${term.id}`}
          aria-current={term.id === showing ? 'page' : undefined}
          className={pillClass(term.id === showing)}
        >
          {term.name}
          {term.current && <span className="text-text-subtle">{term.upcoming ? '· next' : '· now'}</span>}
        </Link>
      ))}
    </nav>
  )
}

function paymentLine(status: string | null, amountCents: number, confirmedAt: Date | null, reason: string | null): string {
  if (amountCents === 0) return 'Nothing to pay'
  switch (status) {
    case 'CONFIRMED':
      return `Paid, thank you!${confirmedAt ? ` Checked on ${confirmedAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', timeZone: SGT })}.` : ''}`
    case 'DECLARED':
      return 'Being checked. An exco member matches it to the bank statement.'
    case 'HELD':
      return 'Sent. It’s checked once you’re on the roster.'
    case 'REJECTED':
      return `The exco couldn’t match it: ${reason ?? 'no reason given'}.`
    default:
      return 'Not paid yet.'
  }
}

function StatusBadge({ status, owes }: { status: string | null; owes: boolean }) {
  if (!owes) return <Badge variant="neutral">Nothing to pay</Badge>
  if (status === 'CONFIRMED') return <Badge variant="success">Paid</Badge>
  if (status === 'DECLARED' || status === 'HELD') return <Badge variant="warning">Being checked</Badge>
  if (status === 'REJECTED') return <Badge variant="danger">Couldn&rsquo;t match</Badge>
  return <Badge variant="neutral">Not paid</Badge>
}

function Answer({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-subtle">{label}</dt>
      <dd className="m-0 whitespace-pre-wrap break-words text-text">{value}</dd>
    </>
  )
}

function Shell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[640px] space-y-4">
      {header}
      {children}
      <p className="pt-2 text-center text-[12px] text-text-subtle">
        FUNKtion - SUTD&rsquo;s Ultimate Popping &amp; Locking Dance Club!
      </p>
    </div>
  )
}

/** The top of the form: the club, the term, and whether it is open. */
function Hero({ title, line, intro }: { title: string; line: string; intro?: string | null }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-brand-ink bg-surface">
      <div aria-hidden className="lapis-band h-1.5" />
      <div className="space-y-2 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">FUNKtion</p>
        <h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-text">{title}</h2>
        <p className="text-[13px] font-medium text-text-muted">{line}</p>
        {intro && <p className="whitespace-pre-wrap pt-1 text-[14px] leading-relaxed text-text">{intro}</p>}
      </div>
    </section>
  )
}
