import { NextResponse, type NextRequest } from 'next/server'
import { getOrgContext, refuseDownloadWithout, verifySession } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { loadMonthDocuments } from '@/modules/coach-claim/documents'
import { MonthNotFrozenError } from '@/modules/coach-claim/snapshot'
import { printPageToPdf } from '@/modules/coach-claim/pdf'
import { MONTHS } from '@/modules/coach-claim/theme'
import { getStorageUnscoped } from '@/core/storage'
import { readSignature } from '@/modules/signatures/store'

export const runtime = 'nodejs'
// Starting Chromium in a cold function takes a few seconds.
export const maxDuration = 60

function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

/**
 * The signed month — the coach's invoice, then the attendance sheet — as the
 * single PDF the Office of Student Life asks for.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; invoiceId: string }> }
) {
  const { orgSlug, invoiceId } = await params
  const { org } = await getOrgContext(orgSlug)
  const refused = await refuseDownloadWithout(org.id, 'claim.generate')
  if (refused) return refused
  const { userId } = await verifySession()

  const loaded = await dbAs(userId, (tx) => loadMonthDocuments(tx, { orgId: org.id, invoiceId })).catch(
    (error) => {
      if (error instanceof MonthNotFrozenError) return null
      throw error
    }
  )
  if (!loaded) return new NextResponse('Not found', { status: 404 })
  if (loaded.summary.status === 'VOID') {
    return new NextResponse('That month was voided, so its documents can no longer be downloaded.', { status: 410 })
  }
  if (!loaded.summary.verifiedAt) {
    return new NextResponse('This month has not been signed yet, so there is no signed PDF to download.', {
      status: 409,
    })
  }

  // A signed month is frozen, so its PDF only needs printing once per
  // signature. Printing starts a whole Chromium and took several seconds on
  // every download; the copy is kept in private storage beside the other
  // month documents, under a key that changes if the month is ever re-signed.
  const cacheKey = `month-pdf/${org.id}/${invoiceId}/${loaded.summary.verifiedAt.getTime()}.pdf`
  const storage = getStorageUnscoped()
  let pdf: Buffer | null = await storage.download(cacheKey).catch(() => null)
  if (!pdf) {
    // Checked before printing, so a storage hiccup is a retry rather than a
    // signed month printed with an empty signature rule.
    if (loaded.signaturePath && (await readSignature(loaded.signaturePath)) === null) {
      return new NextResponse('The signature on this month could not be loaded just now. Try again in a moment.', {
        status: 503,
        headers: { 'Retry-After': '5' },
      })
    }
    pdf = await printPageToPdf({
      appOrigin: appOrigin(),
      path: `/${orgSlug}/monthly-run/${invoiceId}/print`,
      // Only the Supabase session, and only to our own origin.
      sessionCookies: request.cookies
        .getAll()
        .filter((cookie) => cookie.name.startsWith('sb-'))
        .map(({ name, value }) => ({ name, value })),
    })
    // The print page refuses to render a month whose signature it cannot
    // read, so what was printed carries the signature it should.
    await storage.upload(cacheKey, pdf, 'application/pdf').catch((error) => {
      console.error('[pdf] could not keep a copy', error instanceof Error ? error.message : error)
    })
  }

  const { summary } = loaded
  const filename = `${summary.referenceNumber} ${summary.instructorName} ${MONTHS[summary.periodMonth - 1]} ${summary.periodYear}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/["\\\/]/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
