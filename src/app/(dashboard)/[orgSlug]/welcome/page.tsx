import { redirect } from 'next/navigation'
import { dbAs } from '@/core/db'
import { getOrgContext, verifySession } from '@/core/auth/dal'
import { getStanding } from '@/core/auth/standing'
import { studentIdFromEmail } from '@/core/auth/roster-match'
import { currentTerm } from '@/modules/fees/queries'
import { getForm } from '@/modules/membership-form/queries'
import { WelcomeFlow } from './_components/welcome-flow'

export const dynamic = 'force-dynamic'

/**
 * The first screen for somebody the club hasn't matched to its roster yet.
 *
 * They say whether they are new or coming back, and who they are; then they
 * go on to join and pay. Somebody already on the roster — or exco — has no
 * business here and goes home, unless they ask for `?preview`: then they walk
 * through it from the start and nothing they type is saved.
 */
export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()
  const standing = await getStanding(orgSlug)
  const preview = standing === 'FULL' && (await searchParams).preview !== undefined
  if (standing === 'FULL' && !preview) redirect(`/${orgSlug}/dashboard`)

  const [user, term] = await Promise.all([
    dbAs(userId, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          claimedStudentId: true,
          joiningAs: true,
          birthDay: true,
          birthMonth: true,
          birthYear: true,
        },
      })
    ),
    currentTerm(userId, org.id),
  ])
  const form = term ? await getForm(userId, org.id, term.id) : null
  // An account made from an emailed code is named after the address until
  // somebody says otherwise; "ada.personal" is not a name to offer back.
  const placeholder = user ? user.name === user.email.split('@')[0] : true

  return (
    <WelcomeFlow
      orgSlug={orgSlug}
      done={standing === 'JOINING'}
      preview={preview}
      initial={{
        joiningAs: user?.joiningAs ?? null,
        fullName: placeholder ? '' : (user?.name ?? ''),
        studentId: user?.claimedStudentId ?? studentIdFromEmail(user?.email ?? '') ?? '',
        birthDay: user?.birthDay ? String(user.birthDay) : '',
        birthMonth: user?.birthMonth ? String(user.birthMonth) : '',
        birthYear: user?.birthYear ? String(user.birthYear) : '',
      }}
      term={term ? { name: term.name, open: form?.state === 'OPEN' && !term.closed } : null}
    />
  )
}
