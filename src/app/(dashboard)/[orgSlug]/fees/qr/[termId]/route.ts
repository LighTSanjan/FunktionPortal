import { NextResponse } from 'next/server'
import { getOrgContext, verifySession } from '@/core/auth/dal'
import { dbAs } from '@/core/db'

/**
 * This collection's PayNow QR, streamed to any member of the organisation.
 *
 * Every member has to see it, so the check here is membership rather than
 * `fee.manage` — getOrgContext already refuses anybody who is not in this
 * organisation, and the term is read under RLS so a term id from another club
 * returns nothing rather than somebody else's code.
 *
 * Streamed rather than served from a signed URL: a short-lived link is a QR
 * that has expired by the time the member has opened their banking app, and a
 * long-lived one is a permanent public address for a code that stops being
 * the right one the moment the collection closes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; termId: string }> }
) {
  const { orgSlug, termId } = await params
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const term = await dbAs(userId, (tx) =>
    tx.term.findFirst({
      where: { id: termId, orgId: org.id },
      select: { paynowQrPath: true, closedAt: true },
    })
  )

  // A closed collection has been banked and reconciled. Its QR is a live
  // payment code that nobody is watching any more, and a bookmarked link to
  // this URL would go on serving it indefinitely.
  if (term?.closedAt) return new NextResponse('Not found', { status: 404 })

  const { readQr } = await import('@/modules/fees/qr')
  const qr = await readQr(term?.paynowQrPath ?? null)
  if (!qr) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(qr.bytes), {
    headers: {
      'Content-Type': qr.contentType,
      'Content-Disposition': 'inline',
      // Re-checked on every request, and a replaced QR must not be served
      // from a cache to the member who arrives ten minutes later.
      'Cache-Control': 'no-store, private',
    },
  })
}
