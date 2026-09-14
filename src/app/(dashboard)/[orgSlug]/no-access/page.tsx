import Link from 'next/link'
import { getOrgContext } from '@/core/auth/dal'

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
    <div className="mx-auto max-w-[560px] py-16">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-7 py-8">
        <h1 className="text-[18px] font-semibold text-text">That screen is for the exco</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-text-muted">
          {membership.role === 'EXCO'
            ? 'Your post in the club does not include it. If it should, another exco member can change what your access covers.'
            : `You are a member of ${org.name}, and this part of the portal is for the committee — it holds the club's accounts, coaches' details and other members' payments.`}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href={`/${orgSlug}/dashboard`}
            className="inline-flex items-center rounded-[var(--radius-sm)] bg-accent-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-accent-700"
          >
            Back to the home screen
          </Link>
          {membership.role !== 'EXCO' && (
            <Link
              href={`/${orgSlug}/access`}
              className="text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
            >
              I have taken on a committee post
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
