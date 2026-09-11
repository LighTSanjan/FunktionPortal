import { NextResponse } from 'next/server'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { proofKeyFor } from '@/modules/fees/queries'
import { readProof } from '@/modules/fees/proof'

/**
 * One payment screenshot, streamed.
 *
 * Not a redirect to a signed URL. A signed URL is a bearer token in an address
 * bar — it carries no identity, so copying it out of the browser hands the
 * screenshot to anybody until it expires. These carry the payer's name and
 * often part of an account number, which is why they never go to Drive either.
 *
 * Streaming puts the `fee.manage` check and the organisation scope on every
 * request that fetches the bytes, rather than only on the one that minted a
 * link. Nothing is cached, so a shared browser does not keep a copy.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; paymentId: string }> }
) {
  const { orgSlug, paymentId } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'fee.manage')
  const { userId } = await verifySession()

  const key = await proofKeyFor(userId, org.id, paymentId)
  const proof = await readProof(key)
  if (!proof) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(proof.bytes), {
    headers: {
      'Content-Type': proof.contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
    },
  })
}
