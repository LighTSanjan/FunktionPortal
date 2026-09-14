import { getOrgContext, requirePagePermission, verifySession } from '@/core/auth/dal'
import { allowedDomains } from '@/core/auth/eligibility'
import { dbAs } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { revokeInvitation } from '@/actions/invitations'
import { InviteForm } from './_components/invite-form'

export const dynamic = 'force-dynamic'

export default async function InvitationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'org.manage_members')
  const { userId } = await verifySession()

  const invitations = await dbAs(userId, (tx) =>
    tx.invitation.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
    })
  )
  const now = new Date()

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Settings', href: `/${orgSlug}/settings` },
          { label: 'Invitations' },
        ]}
        title="Invitations"
        subtitle={`Anyone with an ${allowedDomains().map((d) => '@' + d).join(' or ')} address can sign in by themselves. Everyone else — instructors, members without one — needs inviting here first.`}
      />

      <Card>
        <CardContent className="space-y-3 py-5">
          <p className="text-[13.5px] text-text-muted">
            They join as an ordinary member the first time they sign in with this address. It lasts
            30 days.
          </p>
          <InviteForm orgSlug={orgSlug} />
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {invitations.map((invitation) => {
              const live = invitation.status === 'PENDING' && invitation.expiresAt > now
              const label = live
                ? 'Waiting'
                : invitation.status === 'PENDING'
                  ? 'Expired'
                  : invitation.status.charAt(0) + invitation.status.slice(1).toLowerCase()
              return (
                <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{invitation.email}</p>
                    <p className="text-[12.5px] text-text-muted">
                      Invited {invitation.createdAt.toISOString().slice(0, 10)}
                      {live ? ` · until ${invitation.expiresAt.toISOString().slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={live ? 'warning' : invitation.status === 'ACCEPTED' ? 'success' : 'neutral'}>
                      {label}
                    </Badge>
                    {live && (
                      <form action={revokeInvitation.bind(null, orgSlug, invitation.id)}>
                        <Button type="submit" size="sm" variant="ghost">
                          Cancel
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
