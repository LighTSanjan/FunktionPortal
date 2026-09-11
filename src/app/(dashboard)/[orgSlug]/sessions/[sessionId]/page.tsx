import { notFound } from 'next/navigation'
import Link from 'next/link'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { hasPermission } from '@/core/permissions'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { getSession, listInstructorOptions } from '@/modules/coach-claim/queries'
import { formatSgd, formatHours, sessionAmountCents } from '@/modules/coach-claim/money'
import { SessionForm } from '../_components/session-form'
import { AttendanceForm } from '../_components/attendance-form'
import { DeleteSessionButton } from '../_components/delete-session-button'

export const dynamic = 'force-dynamic'

export default async function SessionPage({
  params,
}: {
  params: Promise<{ orgSlug: string; sessionId: string }>
}) {
  const { orgSlug, sessionId } = await params
  const { org, membership } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'session.view')
  const { userId } = await verifySession()

  const canManage = hasPermission(membership.role, 'session.manage')
  const [session, instructors] = await Promise.all([
    getSession(userId, org.id, sessionId),
    listInstructorOptions(userId, org.id),
  ])
  if (!session) notFound()

  const monthKey = `${session.heldOn.getUTCFullYear()}-${String(session.heldOn.getUTCMonth() + 1).padStart(2, '0')}`
  const backTo = `/${orgSlug}/sessions?month=${monthKey}`
  const coach = session.instructor
  const amount =
    coach && coach.rateCents !== null
      ? sessionAmountCents(session.durationMinutes, coach.rateCents)
      : null

  const heldOnLabel = session.heldOn.toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Classes', href: backTo },
          { label: heldOnLabel },
        ]}
        title={heldOnLabel}
        subtitle={`${coach ? coach.fullName : 'Self-practice — no coach'} · ${formatHours(
          session.durationMinutes
        )} hr${
          !coach ? '' : amount !== null ? ` · ${formatSgd(amount)}` : ' · no rate covers this date'
        }`}
        actions={canManage ? <DeleteSessionButton orgSlug={orgSlug} sessionId={session.id} returnTo={backTo} /> : undefined}
      />

      {coach && amount === null && (
        <Card>
          <CardContent className="py-4 text-[13px] leading-relaxed text-text-muted">
            No rate covers {heldOnLabel} for {coach.fullName}, so this class cannot be billed
            yet. Add a rate whose start date is on or before it —{' '}
            <Link
              href={`/${orgSlug}/instructors/${coach.id}`}
              className="font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              open their record
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {!coach && (
        <Card>
          <CardContent className="py-4 text-[13px] leading-relaxed text-text-muted">
            Nobody was paid to teach this one. It counts towards attendance and appears on the
            month&rsquo;s sheets with the coach row reading NO, and it reaches no invoice.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="px-1 text-[15px] font-semibold tracking-[-0.01em] text-text">
          Who was there
        </h2>
        <Card>
          <CardContent className="py-5">
            {session.roster.length === 0 ? (
              <div className="space-y-2 py-4 text-center">
                <p className="font-medium">The roster is empty</p>
                <p className="mx-auto max-w-[52ch] text-[13px] leading-relaxed text-text-muted">
                  Attendance is marked against members, and none are recorded yet. The roster
                  comes from the trimester attendance sheet in Drive; until that import is
                  built it has to be entered by hand.
                </p>
              </div>
            ) : (
              <AttendanceForm
                orgSlug={orgSlug}
                sessionId={session.id}
                roster={session.roster}
                readOnly={!canManage}
              />
            )}
          </CardContent>
        </Card>
      </section>

      {canManage && (
        <section className="space-y-3">
          <h2 className="px-1 text-[15px] font-semibold tracking-[-0.01em] text-text">
            Class details
          </h2>
          <Card>
            <CardContent className="py-6">
              <SessionForm
                orgSlug={orgSlug}
                sessionId={session.id}
                instructors={instructors}
                defaults={{
                  instructorId: coach?.id ?? '',
                  heldOn: session.heldOn.toISOString().slice(0, 10),
                  durationMinutes: session.durationMinutes,
                  notes: session.notes ?? '',
                }}
                returnTo={backTo}
              />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
