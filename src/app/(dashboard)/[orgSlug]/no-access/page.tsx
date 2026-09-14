import Link from 'next/link'
import { getOrgContext } from '@/core/auth/dal'
import { ErrorScene } from '@/core/ui/error-scene'

/**
 * Where a page sends somebody who is not allowed on it.
 *
 * Said plainly, because the usual way somebody arrives here is innocent: a
 * link from the club's group chat, or a bookmark from when they held a post.
 */
export default async function NoAccessPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, membership } = await getOrgContext(orgSlug)

  return (
    <ErrorScene
      kind="no-access"
      body={
        <>
          <p className="font-medium text-text">That screen is for the exco.</p>
          <p className="mt-1">
            {membership.role === 'EXCO'
              ? 'Your post in the club does not include it. If it should, another exco member can change what your access covers.'
              : `You are a member of ${org.name}, and this part of the portal is for the committee — it holds the club's accounts, coaches' details and other members' payments.`}
          </p>
        </>
      }
      actions={
        <>
          <Link
            href={`/${orgSlug}/dashboard`}
            className="lapis-stack inline-flex h-11 items-center rounded-[var(--radius-md)] bg-accent-500 px-5 text-[14px] font-medium text-white hover:bg-accent-400"
          >
            Back to the home screen
          </Link>
          {membership.role !== 'EXCO' && (
            <Link
              href={`/${orgSlug}/access`}
              className="text-[14px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              I have taken on a committee post
            </Link>
          )}
        </>
      }
    />
  )
}
