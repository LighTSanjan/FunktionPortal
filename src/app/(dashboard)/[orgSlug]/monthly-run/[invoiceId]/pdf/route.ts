import { NextResponse, type NextRequest } from 'next/server'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { loadMonthDocuments } from '@/modules/coach-claim/documents'
import { MonthNotFrozenError } from '@/modules/coach-claim/snapshot'
import { printPageToPdf } from '@/modules/coach-claim/pdf'
import { MONTHS } from '@/modules/coach-claim/theme'

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
  await requirePermission(org.id, 'claim.generate')
  const { userId } = await verifySession()

  const loaded = await dbAs(userId, (tx) => loadMonthDocuments(tx, { orgId: org.id, invoiceId })).catch(
    (error) => {
      if (error instanceof MonthNotFrozenError) return null
      throw error
    }
  )
  if (!loaded) return new NextResponse('Not found', { status: 404 })
  if (!loaded.summary.verifiedAt) {
    return new NextResponse('This month has not been signed yet, so there is no signed PDF to download.', {
      status: 409,
    })
  }

  const pdf = await printPageToPdf({
    appOrigin: appOrigin(),
    path: `/${orgSlug}/monthly-run/${invoiceId}/print`,
    // Only the Supabase session, and only to our own origin.
    sessionCookies: request.cookies
      .getAll()
      .filter((cookie) => cookie.name.startsWith('sb-'))
      .map(({ name, value }) => ({ name, value })),
  })

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
