import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { listAccessRequests, OFFICE_LABELS } from '@/core/access'
import { verifySession } from '@/core/auth/dal'
import { DecisionForm } from './_components/decision-form'

export const dynamic = 'force-dynamic'

/**
 * The exco queue: who is asking for access, and the two buttons that settle it.
 *
 * Approving widens somebody's reach to the roster, every payment and the
 * register, so the card leads with what is being handed over rather than with
 * the requester's name.
 */
export default async function AccessRequestsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'org.manage_members')
  const { userId } = await verifySession()

  const requests = await listAccessRequests(org.id)
  const now = new Date()
  const pending = requests.filter((r) => r.status === 'PENDING' && r.expiresAt > now)
  const settled = requests.filter((r) => !(r.status === 'PENDING' && r.expiresAt > now))

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Settings', href: `/${orgSlug}/settings` },
          { label: 'Access requests' },
        ]}
        title="Access requests"
        subtitle="Members asking for exco access. You cannot approve your own."
      />

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-[13.5px] text-text-muted">
            Nothing waiting.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {pending.map((request) => (
            <li key={request.id}>
              <Card>
                <CardContent className="space-y-4 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {request.userName} wants{' '}
                        {request.requestedOffice ? OFFICE_LABELS[request.requestedOffice] : 'exco'}{' '}
                        access
                      </p>
                      <p className="text-[13px] text-text-muted">
                        {request.userEmail} · raised {request.createdAt.toISOString().slice(0, 10)}
                      </p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>

                  <blockquote className="border-l-2 border-border pl-3 text-[13.5px] leading-relaxed text-text-muted">
                    {request.reason}
                  </blockquote>

                  <div className="rounded-[var(--radius-sm)] bg-surface-hover p-3 text-[12.5px] leading-relaxed text-text-muted">
                    Approving gives them the roster, every fee payment and its evidence, the fund
                    balances, the reference counters and the Transaction Register.
                  </div>

                  {request.userId === userId ? (
                    <p className="text-[13px] text-warn">
                      This is your own request — another exco member has to decide it.
                    </p>
                  ) : (
                    <DecisionForm orgSlug={orgSlug} requestId={request.id} />
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {settled.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
            Settled
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {settled.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{request.userName}</p>
                    <p className="text-[12.5px] text-text-muted">
                      {request.requestedOffice ? OFFICE_LABELS[request.requestedOffice] : 'Exco'}
                      {request.reviewedByName ? ` · by ${request.reviewedByName}` : ''}
                      {request.reviewedAt ? ` · ${request.reviewedAt.toISOString().slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <Badge
                    variant={
                      request.status === 'APPROVED'
                        ? 'success'
                        : request.status === 'REJECTED'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {request.status === 'PENDING'
                      ? 'Expired'
                      : request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
