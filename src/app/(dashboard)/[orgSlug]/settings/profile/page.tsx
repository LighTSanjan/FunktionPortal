import Link from 'next/link'
import { verifySession, getOrgContext } from '@/core/auth/dal'
import { getStanding } from '@/core/auth/standing'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { isEmptyLogin } from '@/core/auth/empty-login'
import { ownRosterRow } from '@/core/auth/own-profile'
import { isDemo } from '@/core/auth/demo'
import { studentIdFromEmail } from '@/core/auth/roster-match'
import { dbAs } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { OFFICE_LABELS } from '@/core/access'
import { photoUrl } from '@/modules/photos'
import { signaturePreviewUrl } from '@/modules/signatures'
import { ProfileForm } from './_components/profile-form'
import { PhotoForm } from './_components/photo-form'
import { SignInMethods } from './_components/sign-in-methods'
import { SignatureForm } from './_components/signature-form'

export const dynamic = 'force-dynamic'

const OUTCOMES = ['connected', 'taken', 'failed'] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ google?: string }>
}) {
  const { orgSlug } = await params
  const { org, membership } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()
  const standing = await getStanding(orgSlug)

  const supabase = await createSupabaseServer()
  const [{ user, membershipRow }, member, identities, removable] = await Promise.all([
    dbAs(userId, async (tx) => ({
      user: await tx.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          photoPath: true,
          claimedStudentId: true,
          birthDay: true,
          birthMonth: true,
          birthYear: true,
          signatureImagePath: true,
          signatureUpdatedAt: true,
        },
      }),
      membershipRow: await tx.organisationMembership.findUnique({
        where: { userId_orgId: { userId, orgId: org.id } },
        select: { office: true },
      }),
    })),
    ownRosterRow(org.id, userId),
    supabase.auth.getUserIdentities().then(({ data }) => data?.identities ?? []),
    isEmptyLogin(userId),
  ])
  if (!user) return null

  const isExco = membership.role === 'EXCO'
  const google = identities.find((identity) => identity.provider === 'google')
  const googleEmail = google ? String((google.identity_data as Record<string, unknown> | undefined)?.email ?? '') || 'connected' : null
  const { google: returned } = await searchParams
  const outcome = OUTCOMES.find((value) => value === returned) ?? null
  // Minted per request and short-lived, so the page cannot be saved and
  // reshared as a way of handing somebody a specimen.
  const signatureUrl = isExco ? await signaturePreviewUrl(user.signatureImagePath) : null
  const birth = member ?? user

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Settings', href: `/${orgSlug}/settings` },
          { label: 'Profile' },
        ]}
        title="Your profile"
      />

      <Card>
        <CardContent className="space-y-6 py-6">
          <PhotoForm orgSlug={orgSlug} name={user.name} src={photoUrl(user.photoPath)} />
          <ProfileForm
            orgSlug={orgSlug}
            details={{
              name: user.name,
              email: user.email,
              studentId: member?.studentId ?? user.claimedStudentId ?? studentIdFromEmail(user.email) ?? '',
              onRoster: member !== null,
              birthDay: birth.birthDay ? String(birth.birthDay) : '',
              birthMonth: birth.birthMonth ? String(birth.birthMonth) : '',
              birthYear: birth.birthYear ? String(birth.birthYear) : '',
            }}
          />
        </CardContent>
      </Card>

      <Section title="Signing in">
        <SignInMethods
          orgSlug={orgSlug}
          email={user.email}
          google={googleEmail}
          googleOnly={identities.length === 1 && google !== undefined}
          removable={removable}
          outcome={outcome}
          demo={isDemo()}
        />
      </Section>

      <Section title={`In ${org.name}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] font-medium">
            {isExco ? 'Exco' : 'Member'}
            {membershipRow?.office ? ` · ${OFFICE_LABELS[membershipRow.office]}` : ''}
          </p>
          <Badge variant={isExco ? 'success' : 'neutral'}>{isExco ? 'Full access' : 'Your own records'}</Badge>
        </div>
        {!isExco && (
          <p className="text-[13px] text-text-muted">
            {standing === 'FULL' ? (
              <>
                On the exco now?{' '}
                <Link href={`/${orgSlug}/access`} className="font-medium text-accent-600 underline-offset-4 hover:underline">
                  Ask for exco access
                </Link>
                . Another exco member approves it.
              </>
            ) : (
              'Once you’re on the club roster, you can ask for exco access here. Already exco on another login? Sign in with that one and connect Google to it.'
            )}
          </p>
        )}
      </Section>

      {isExco && (
        <Section title="Signature">
          <p className="max-w-[62ch] text-[13px] leading-relaxed text-text-muted">
            Stamped on the documents you sign off, only when you press the button that signs them. Sign a blank sheet of
            white paper, photograph it straight on, and crop to the signature.
          </p>
          <SignatureForm
            orgSlug={orgSlug}
            currentUrl={signatureUrl}
            updatedAt={
              user.signatureUpdatedAt
                ? user.signatureUpdatedAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
                : null
            }
          />
        </Section>
      )}
    </div>
  )
}
