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
import { DeclareForm } from './_components/declare-form'
import { ClaimForm } from './_components/claim-form'

export const dynamic = 'force-dynamic'

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

  return (
    <div className="mx-auto max-w-[720px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Subscription' },
        ]}
        title="Your subscription"
        subtitle="Pay by PayNow, then tell the portal. An exco member checks it against the bank statement — saying you paid and being recorded as having paid are deliberately two different things."
        actions={
          canManage ? (
            <Link
              href={`/${orgSlug}/fees/collection`}
              className="lapis-press inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3.5 text-[13px] font-medium text-text hover:bg-surface-hover"
            >
              The collection
            </Link>
          ) : undefined
        }
      />

      {!fee.member && (
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <div className="space-y-2">
              <p className="font-medium">Your account is not matched to the roster yet</p>
              <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
                The roster comes from the club&rsquo;s attendance sheet, where everybody is
                identified by student ID. Until your account is matched to your row, the portal
                cannot tell what you owe.
              </p>
            </div>
            <ClaimForm orgSlug={orgSlug} claimed={claimedStudentId} />
          </CardContent>
        </Card>
      )}

      {fee.member && !fee.term && (
        <Card>
          <CardContent className="space-y-2 py-8 text-center">
            <p className="font-medium">No term is open</p>
            <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
              There is nothing to collect until the exco open one.
            </p>
          </CardContent>
        </Card>
      )}

      {fee.member && fee.term && fee.owesNothing && (
        <Card>
          <CardContent className="space-y-2 py-8 text-center">
            <p className="font-medium">Nothing to pay</p>
            <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
              The roster has you as having left the club, so no subscription is due for{' '}
              {fee.term.name}. If that is wrong, ask an exco member to put the roster right and
              this page will follow.
            </p>
          </CardContent>
        </Card>
      )}

      {fee.member && fee.term && !fee.owesNothing && (
        <>
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                    {fee.term.name}
                  </p>
                  <p className="mt-1.5 text-[24px] font-semibold leading-none tabular-nums">
                    {formatSgd(fee.amountCents)}
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-text-muted">
                    {TIER_LABEL[fee.tier]}
                    {fee.term.finalCollectionAt && (
                      <>
                        {' · due by '}
                        {fee.term.finalCollectionAt.toLocaleDateString('en-SG', {
                          day: 'numeric',
                          month: 'long',
                          timeZone: 'UTC',
                        })}
                      </>
                    )}
                  </p>
                </div>
                <StatusBadge status={fee.payment?.status ?? null} />
              </div>

              {fee.payment?.status === 'CONFIRMED' && (
                <p className="text-[13px] leading-relaxed text-text-muted">
                  Confirmed against the bank statement
                  {fee.payment.confirmedAt
                    ? ` on ${fee.payment.confirmedAt.toLocaleDateString('en-SG', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}`
                    : ''}
                  . Nothing more to do.
                </p>
              )}

              {fee.payment?.status === 'DECLARED' && (
                <p className="text-[13px] leading-relaxed text-text-muted">
                  Sent. The exco reconcile declarations against the bank statement, usually once
                  the collection closes. Reference{' '}
                  <span className="font-mono text-[12.5px]">{fee.payment.paymentReference}</span>.
                </p>
              )}

              {fee.payment?.status === 'REJECTED' && (
                <p className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed">
                  The exco could not match that against the statement:{' '}
                  <strong className="font-semibold">{fee.payment.rejectedReason}</strong>. Declare
                  it again below once it is sorted.
                </p>
              )}
            </CardContent>
          </Card>

          {fee.term.closed ? (
            <Card>
              <CardContent className="py-5 text-[13px] leading-relaxed text-text-muted">
                This collection has been closed and banked in, so the portal cannot take a new
                declaration for it. Speak to the treasurer.
              </CardContent>
            </Card>
          ) : (
            fee.payment?.status !== 'CONFIRMED' && (
              <>
                <Card>
                  <CardContent className="space-y-3 py-5">
                    <p className="text-[14px] font-semibold">Pay by PayNow</p>
                    {fee.term.hasPaynowQr ? (
                      <>
                        {/* Streamed by a route that re-checks membership, and
                            never cached: a QR replaced mid-collection must not
                            keep resolving to the superseded code.
                            eslint-disable-next-line @next/next/no-img-element */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/${orgSlug}/fees/qr/${fee.term.id}`}
                          alt={`PayNow QR for the ${fee.term.name} subscription`}
                          className="max-h-[240px] rounded-[var(--radius-sm)] border border-border bg-white p-2"
                        />
                        <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-text-muted">
                          Transfer {formatSgd(fee.amountCents)} exactly. A different amount is one
                          the exco cannot match to you without asking.
                        </p>
                      </>
                    ) : (
                      // A blank space where a QR should be is a member who
                      // cannot tell whether the club has not put it up or
                      // their own browser has failed. Say which.
                      <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-text-muted">
                        The QR for this collection is not up yet — a new one is generated for
                        each term. Ask the treasurer for it, and do not reuse last term&rsquo;s:
                        it collects into an account nobody is reconciling against this roster.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-6">
                    <DeclareForm
                      orgSlug={orgSlug}
                      termId={fee.term.id}
                      amount={formatSgd(fee.amountCents)}
                      redeclaring={fee.payment !== null}
                    />
                  </CardContent>
                </Card>
              </>
            )
          )}
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'CONFIRMED') return <Badge variant="success">Confirmed</Badge>
  if (status === 'DECLARED') return <Badge variant="warning">Waiting on the exco</Badge>
  if (status === 'REJECTED') return <Badge variant="danger">Not matched</Badge>
  return <Badge variant="neutral">Not paid</Badge>
}
