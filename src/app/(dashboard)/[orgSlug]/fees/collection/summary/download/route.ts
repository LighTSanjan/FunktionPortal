import { NextResponse } from 'next/server'
import { getOrgContext, refuseDownloadWithout, verifySession } from '@/core/auth/dal'
import { buildTermSummary } from '@/modules/fees/summary'
import { renderFeeSummary } from '@/modules/fees/summary-doc'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** The term summary as a file, built from the same rows as the page. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  const refused = await refuseDownloadWithout(org.id, 'fee.manage')
  if (refused) return refused
  const { userId } = await verifySession()

  const termId = new URL(request.url).searchParams.get('term')
  if (!termId) return new NextResponse('Not found', { status: 404 })

  const data = await buildTermSummary(userId, org.id, org.name, termId)
  if (!data) return new NextResponse('Not found', { status: 404 })

  const body = await renderFeeSummary(data)
  const filename = `${data.termName} subscriptions.docx`.replace(/["\\]/g, '')

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': DOCX,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
