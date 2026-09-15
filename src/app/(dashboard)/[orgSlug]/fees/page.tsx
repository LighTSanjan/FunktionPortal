import Link from 'next/link'
import { dbAs } from '@/core/db'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { hasPermission } from '@/core/permissions'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { getOwnFee } from '@/modules/fees/queries'
import { TIER_LABEL } from '@/modules/fees/tiers'
import { formatSgd } from '@/modules/coach-claim/money'
import { ClaimForm } from './_components/claim-form'
import { PayPanel } from './_components/pay-panel'

export const dynamic = 'force-dynamic'

/**
 * A member's own membership fee.
 *
 * One card that says what they owe and where it stands, and one thing to do
 * next. Most of what the old page explained — why a declaration is not a
 * confirmation — is the exco's concern, not the payer's.
 */
export default async function FeesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, membership } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'fee.declare')
  const { userId } = await verifySession()

  const fee = await getOwnFee(userId, org.id, null)
  const claimedStudentId = fee.member
    ? null
    : ((
        await dbAs(userId, (tx) =>
          tx.user.findUnique({ where: { id: userId }, select: { claimedStudentId: true } })
        )
      )?.claimedStudentId ?? null)
  const canManage = hasPermission(membership.role, 'fee.manage')

  // Already a local calendar date (fromDateColumn); read in UTC it is the day before.
  const due = fee.term?.finalCollectionAt?.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'long',
  })
  const status = fee.payment?.status ?? null

  return (
    <div className="mx-auto max-w-[640px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Your membership fee' },
        ]}
        title="Your membership fee"
        actions={
          canManage ? (
            <Link
              href={`/${orgSlug}/fees/collection`}
              className="lapis-press inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3.5 text-[13px] font-medium text-text hover:bg-surface-hover"
            >
              Everyone&rsquo;s fees
            </Link>
          ) : undefined
        }
      />

      {!fee.member && (
        <Card>
          <CardContent className="space-y-4 py-7">
            <div className="space-y-2">
              <p className="text-[15px] font-semibold">We can&rsquo;t find you on the club roster yet</p>
              <p className="max-w-[56ch] text-[13px] leading-relaxed text-text-muted">
                The quickest fix: sign out and sign in with your student-ID email, like{' '}
                <span className="font-mono text-text">1001234@mymail.sutd.edu.sg</span>. You&rsquo;ll be
                matched straight away. Or tell us your student ID and an exco member will match you.
              </p>
            </div>
            <ClaimForm orgSlug={orgSlug} claimed={claimedStudentId} />
          </CardContent>
        </Card>
      )}

      {fee.member && !fee.term && (
        <Card>
          <CardContent className="space-y-1 py-8 text-center">
            <p className="font-medium">Nothing to pay right now</p>
            <p className="text-[13px] text-text-muted">The exco haven&rsquo;t opened a term&rsquo;s collection yet.</p>
          </CardContent>
        </Card>
      )}

      {fee.member && fee.term && (
        <Card>
          <CardContent className="space-y-5 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                  {fee.term.name}
                </p>
                {fee.owesNothing ? (
                  <p className="mt-1.5 text-[22px] font-semibold leading-tight">Nothing to pay</p>
                ) : (
                  <>
                    <p className="mt-1.5 text-[30px] font-semibold leading-none tabular-nums">
                      {formatSgd(fee.amountCents)}
                    </p>
                    <p className="mt-1.5 text-[12.5px] text-text-muted">
                      {TIER_LABEL[fee.tier]}
                      {due && status !== 'CONFIRMED' && ` · please pay by ${due}`}
                    </p>
                  </>
                )}
              </div>
              {!fee.owesNothing && <StatusBadge status={status} />}
            </div>

            {fee.owesNothing && (
              <p className="text-[13px] leading-relaxed text-text-muted">
                {fee.tier === 'WAIVED'
                  ? `Your fee for ${fee.term.name} has been waived.`
                  : `The roster has you as not taking part in ${fee.term.name}. If that's wrong, let an exco member know.`}
              </p>
            )}

            {status === 'CONFIRMED' && (
              <p className="rounded-[var(--radius-sm)] border border-success/20 bg-success/8 p-3 text-[13px] leading-relaxed">
                Paid, thank you!
                {fee.payment?.confirmedAt &&
                  ` Recorded on ${fee.payment.confirmedAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'long' })}.`}{' '}
                See you next session!
              </p>
            )}

            {status === 'DECLARED' && (
              <p className="rounded-[var(--radius-sm)] border border-warning/25 bg-warning/8 p-3 text-[13px] leading-relaxed">
                Got it. An exco member will match your payment to the bank statement, and this changes to
                Paid once they have.
              </p>
            )}

            {status === 'REJECTED' && (
              <p className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed">
                The exco couldn&rsquo;t match your payment:{' '}
                <strong className="font-semibold">{fee.payment?.rejectedReason}</strong>. Once it&rsquo;s sorted,
                send it again below.
              </p>
            )}

            {!fee.owesNothing && status !== 'CONFIRMED' && status !== 'DECLARED' && fee.term.closed && (
              <p className="text-[13px] leading-relaxed text-text-muted">
                This term&rsquo;s collection has closed. Please speak to the treasurer.
              </p>
            )}

            {!fee.owesNothing && status !== 'CONFIRMED' && status !== 'DECLARED' && !fee.term.closed && (
              <PayPanel
                orgSlug={orgSlug}
                termId={fee.term.id}
                termName={fee.term.name}
                amount={formatSgd(fee.amountCents)}
                hasQr={fee.term.hasPaynowQr}
                redeclaring={fee.payment !== null}
              />
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-[12px] text-text-subtle">
        FUNKtion - SUTD&rsquo;s Ultimate Popping &amp; Locking Dance Club!
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'CONFIRMED') return <Badge variant="success">Paid</Badge>
  if (status === 'DECLARED') return <Badge variant="warning">Being checked</Badge>
  if (status === 'REJECTED') return <Badge variant="danger">Couldn&rsquo;t match</Badge>
  return <Badge variant="neutral">Not paid</Badge>
}
