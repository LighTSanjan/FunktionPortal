import Link from 'next/link'
import { verifySession, getOrgContext } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { PageHeader } from '@/core/ui/page-header'
import { Card, CardContent } from '@/core/ui/card'
import { Badge } from '@/core/ui/badge'
import { OFFICE_LABELS } from '@/core/access'
import { ProfileForm } from './_components/profile-form'
import { SignatureForm } from './_components/signature-form'
import { signaturePreviewUrl } from '@/modules/signatures'

export const dynamic = 'force-dynamic'

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, membership } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const { user, membershipRow } = await dbAs(userId, async (tx) => ({
    user: await tx.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        signatureImagePath: true,
        signatureUpdatedAt: true,
        createdAt: true,
      },
    }),
    membershipRow: await tx.organisationMembership.findUnique({
      where: { userId_orgId: { userId, orgId: org.id } },
      select: { office: true, createdAt: true },
    }),
  }))

  if (!user) return null

  const isExco = membership.role === 'EXCO'
  // Minted per request and short-lived, so the page cannot be saved and
  // reshared as a way of handing somebody a specimen.
  const signatureUrl = await signaturePreviewUrl(user.signatureImagePath)

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbItems={[
          { label: org.name, href: `/${orgSlug}/dashboard` },
          { label: 'Settings', href: `/${orgSlug}/settings` },
          { label: 'Profile' },
        ]}
        title="Your profile"
        subtitle="How you appear in the portal and on the documents it produces."
      />

      <Card>
        <CardContent className="py-6">
          <ProfileForm
            orgSlug={orgSlug}
            name={user.name}
            email={user.email}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                In {org.name}
              </p>
              <p className="mt-1.5 font-medium">
                {isExco ? 'Exco' : 'Member'}
                {membershipRow?.office ? ` · ${OFFICE_LABELS[membershipRow.office]}` : ''}
              </p>
              {membershipRow?.createdAt && (
                <p className="mt-0.5 text-[12.5px] text-text-muted">
                  Since{' '}
                  {membershipRow.createdAt.toLocaleDateString('en-SG', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
            <Badge variant={isExco ? 'success' : 'neutral'}>
              {isExco ? 'Full access' : 'Your own records only'}
            </Badge>
          </div>

          {!isExco && (
            <p className="text-[13px] leading-relaxed text-text-muted">
              Taken on a committee post?{' '}
              <Link
                href={`/${orgSlug}/access`}
                className="font-medium text-accent-600 underline-offset-4 hover:underline"
              >
                Ask for exco access
              </Link>
              . Another exco member decides it, never you.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">Signature specimen</p>
            <Badge variant={signatureUrl ? 'success' : 'neutral'}>
              {signatureUrl ? 'On file' : 'Not uploaded'}
            </Badge>
          </div>
          <p className="max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
            A stored signature lets the portal stamp the documents you sign off instead of
            asking you to print and sign one every month. It is only ever applied in the same
            moment you press the button that authorises a document, and only to documents you
            authorise yourself &mdash; never on a schedule and never on anyone else&rsquo;s
            behalf.
          </p>
          <p className="max-w-[68ch] text-[13px] leading-relaxed text-text-muted">
            Sign a blank sheet of white paper, photograph it straight on, and crop to the
            signature. PNG or JPEG, at least 200 pixels wide.
          </p>

          <SignatureForm
            orgSlug={orgSlug}
            currentUrl={signatureUrl}
            updatedAt={
              user.signatureUpdatedAt
                ? user.signatureUpdatedAt.toLocaleDateString('en-SG', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : null
            }
          />

          <p className="max-w-[68ch] border-t border-border pt-4 text-[12.5px] leading-relaxed text-text-subtle">
            Held in private storage, read only by the server while it composes a document you
            have just signed, and never rendered into a page as a link anyone else could
            follow. Uploading, replacing and removing it are all written to the audit log.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
