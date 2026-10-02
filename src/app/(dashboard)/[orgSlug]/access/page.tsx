import { getOrgContext, verifySession } from '@/core/auth/dal'
import { requireFullMember } from '@/core/auth/standing'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { getOwnAccessRequest, getMembership, OFFICE_LABELS, REQUEST_TTL_DAYS } from '@/core/access'
import { RequestAccessForm } from './_components/request-access-form'
import { WithdrawButton } from './_components/withdraw-button'

export const dynamic = 'force-dynamic'

export default async function AccessPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, membership } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()
  await requireFullMember(orgSlug)

  const [request, current] = await Promise.all([
    getOwnAccessRequest(org.id, userId),
    getMembership(org.id, userId),
  ])

  const pending = request?.status === 'PENDING' && request.expiresAt > new Date()

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[{ label: org.name, href: `/${orgSlug}/dashboard` }, { label: 'Your access' }]}
        title="Your access"
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Right now
            </p>
            <p className="mt-1.5 font-medium">
              {current?.role === 'EXCO' ? 'Exco' : 'Member'}
              {current?.office ? ` · ${OFFICE_LABELS[current.office]}` : ''}
            </p>
          </div>
          <Badge variant={current?.role === 'EXCO' ? 'success' : 'neutral'}>
            {current?.role === 'EXCO' ? 'Full access' : 'Your own records only'}
          </Badge>
        </CardContent>
      </Card>

      {membership.role === 'EXCO' ? (
        <Card>
          <CardContent className="py-5 text-[13.5px] text-text-muted">
            You&rsquo;re exco. To change your office, ask another exco member.
          </CardContent>
        </Card>
      ) : pending && request ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  Waiting on the exco — {OFFICE_LABELS[request.requestedOffice!]}
                </p>
                <p className="text-[13px] text-text-muted">
                  Raised {request.createdAt.toISOString().slice(0, 10)} · expires{' '}
                  {request.expiresAt.toISOString().slice(0, 10)}
                </p>
              </div>
              <Badge variant="warning">Pending</Badge>
            </div>
            <blockquote className="border-l-2 border-border pl-3 text-[13.5px] text-text-muted">
              {request.reason}
            </blockquote>
            <WithdrawButton orgSlug={orgSlug} requestId={request.id} />
          </CardContent>
        </Card>
      ) : (
        <>
          {request && request.status !== 'PENDING' && (
            <Card>
              <CardContent className="space-y-2 py-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">Your last request</p>
                  <Badge
                    variant={
                      request.status === 'APPROVED'
                        ? 'success'
                        : request.status === 'REJECTED'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                  </Badge>
                </div>
                {request.reviewedByName && (
                  <p className="text-[13px] text-text-muted">
                    Decided by {request.reviewedByName} on{' '}
                    {request.reviewedAt?.toISOString().slice(0, 10)}
                  </p>
                )}
                {request.decisionNote && (
                  <p className="text-[13.5px] text-text-muted">{request.decisionNote}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-5 py-6">
              <div>
                <p className="font-medium">Ask for exco access</p>
                <p className="mt-1 text-[13.5px] text-text-muted">
                  Another exco member approves it. Requests expire after {REQUEST_TTL_DAYS} days.
                </p>
              </div>
              <RequestAccessForm orgSlug={orgSlug} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
