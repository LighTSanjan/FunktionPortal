import { NextResponse } from 'next/server'
import { getOrgContext, refuseDownloadWithout, verifySession } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { loadMonthDocuments, withSignature, SignatureUnavailableError } from '@/modules/coach-claim/documents'
import { MonthNotFrozenError } from '@/modules/coach-claim/snapshot'
import { renderInvoice } from '@/modules/coach-claim/invoice'
import { renderAttendanceSheet } from '@/modules/coach-claim/attendance-sheet'
import { renderMonthPack } from '@/modules/coach-claim/month-pack'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Rebuild a month's document from its stored rows.
 *
 * Nothing is kept as a blob, so there is one copy of the truth and a document
 * downloaded twice cannot differ from itself. The values fixed at generation —
 * the reference number, the invoice date, the stamped signature — are read
 * back rather than recomputed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; invoiceId: string; document: string }> }
) {
  const { orgSlug, invoiceId, document } = await params
  if (document !== 'invoice.docx' && document !== 'attendance-sheet.docx' && document !== 'month.docx') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { org } = await getOrgContext(orgSlug)
  const refused = await refuseDownloadWithout(org.id, 'claim.generate')
  if (refused) return refused
  const { userId } = await verifySession()

  const loaded = await dbAs(userId, (tx) =>
    loadMonthDocuments(tx, { orgId: org.id, invoiceId })
  ).catch((error) => {
    if (error instanceof MonthNotFrozenError) return null
    throw error
  })
  if (!loaded) return new NextResponse('Not found', { status: 404 })
  // A voided month's documents are a record on the page, not something to
  // send. A copy downloaded from here would carry nothing to say it is void.
  if (loaded.summary.status === 'VOID') {
    return new NextResponse('That month was voided, so its documents can no longer be downloaded.', { status: 410 })
  }

  const documents = await withSignature(loaded).catch((error) => {
    if (error instanceof SignatureUnavailableError) return null
    throw error
  })
  if (!documents) {
    return new NextResponse('The signature on this month could not be loaded just now. Try again in a moment.', {
      status: 503,
      headers: { 'Retry-After': '5' },
    })
  }
  const { summary, invoice, sheet } = documents

  const month = `${summary.periodYear}-${String(summary.periodMonth).padStart(2, '0')}`
  const body =
    document === 'month.docx'
      ? await renderMonthPack(invoice, sheet)
      : document === 'invoice.docx'
        ? await renderInvoice(invoice)
        : await renderAttendanceSheet(sheet)

  const filename =
    document === 'month.docx'
      ? `${summary.referenceNumber} ${summary.instructorName} ${month}.docx`
      : document === 'invoice.docx'
        ? `${summary.documentNo}.docx`
        : `Attendance ${summary.instructorName} ${month}.docx`

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': DOCX,
      'Content-Disposition': `attachment; filename="${filename.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
