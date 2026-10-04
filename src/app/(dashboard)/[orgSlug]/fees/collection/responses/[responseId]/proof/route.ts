import { NextResponse } from 'next/server'
import { getOrgContext, refuseDownloadWithout, verifySession } from '@/core/auth/dal'
import { heldProofKeyFor } from '@/modules/membership-form/queries'
import { readProof } from '@/modules/fees/proof'

/**
 * The screenshot held on a form response that is not on the roster yet.
 * Streamed with the same `fee.manage` check on every request as every other
 * payment screenshot, for the same reasons.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; responseId: string }> }
) {
  const { orgSlug, responseId } = await params
  const { org } = await getOrgContext(orgSlug)
  const refused = await refuseDownloadWithout(org.id, 'fee.manage')
  if (refused) return refused
  const { userId } = await verifySession()

  const proof = await readProof(await heldProofKeyFor(userId, org.id, responseId))
  if (!proof) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(proof.bytes), {
    headers: {
      'Content-Type': proof.contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
    },
  })
}
