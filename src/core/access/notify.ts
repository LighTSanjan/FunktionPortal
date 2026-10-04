/**
 * Telling the president and treasurer that somebody has asked for exco access.
 *
 * The request otherwise waits on the access screen until an exco member
 * happens to open the portal, and an access request is exactly the thing
 * that should not sit unseen: it is somebody asking to see every member's
 * payments.
 */
import 'server-only'
import type { ExcoOffice } from '@prisma/client'
import { dbAdmin } from '@/core/db/admin'
import { sendMail } from '@/core/mail'
import { appUrl } from '@/lib/app-url'
import { OFFICE_LABELS, REQUEST_TTL_DAYS } from './index'

/** Whose job it is to look. Every exco member if neither post is filled. */
const NOTIFIED_OFFICES: ExcoOffice[] = ['PRESIDENT', 'TREASURER']

export async function excoToNotify(orgId: string, requesterId: string): Promise<string[]> {
  const exco = await dbAdmin.organisationMembership.findMany({
    where: { orgId, role: 'EXCO', isActive: true, userId: { not: requesterId }, user: { isActive: true } },
    select: { office: true, user: { select: { email: true } } },
  })
  const named = exco.filter((row) => row.office && NOTIFIED_OFFICES.includes(row.office))
  return (named.length > 0 ? named : exco).map((row) => row.user.email)
}

export async function notifyAccessRequested(args: {
  org: { id: string; name: string; slug: string }
  requesterId: string
  requestedOffice: ExcoOffice
  reason: string
}): Promise<boolean> {
  const [to, requester] = await Promise.all([
    excoToNotify(args.org.id, args.requesterId),
    dbAdmin.user.findUnique({ where: { id: args.requesterId }, select: { name: true, email: true } }),
  ])
  if (!requester || to.length === 0) return false

  const office = OFFICE_LABELS[args.requestedOffice]
  return sendMail({
    to,
    subject: `${requester.name} asked for exco access`,
    text: [
      `${requester.name} (${requester.email}) asked for exco access on the ${args.org.name} portal, as ${office}.`,
      '',
      'Their reason:',
      args.reason,
      '',
      `Approve or reject it here: ${appUrl()}/${args.org.slug}/settings/access`,
      '',
      `Exco access shows every member's payments, so check it's really them. The request expires in ${REQUEST_TTL_DAYS} days.`,
    ].join('\n'),
  })
}
