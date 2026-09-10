import { NextResponse } from 'next/server'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { fromDateColumn } from '@/lib/date-only'
import { buildClaim, buildClaimContext } from '@/modules/coach-claim/monthly-run'
import { toInvoiceData, toAttendanceSheetData } from '@/modules/coach-claim/claim'
import { renderInvoice } from '@/modules/coach-claim/invoice'
import { renderAttendanceSheet } from '@/modules/coach-claim/attendance-sheet'
import type { FundSource } from '@/modules/coach-claim/types'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Rebuild a month's document from stored sessions, rates and fixed invoice data. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; invoiceId: string; document: string }> }
) {
  const { orgSlug, invoiceId, document } = await params
  if (document !== 'invoice.docx' && document !== 'attendance-sheet.docx') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'claim.generate')
  const { userId, name: treasurerName } = await verifySession()

  const result = await dbAs(userId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id },
      include: { referenceNumber: { select: { formatted: true } } },
    })
    if (!invoice) return null

    const context = await buildClaimContext(tx, {
      orgId: org.id,
      orgName: org.name,
      instructorId: invoice.instructorId,
      periodYear: invoice.periodYear,
      periodMonth: invoice.periodMonth,
      fundSource: invoice.fundSource as FundSource,
      referenceNumber: invoice.referenceNumber?.formatted ?? '',
      treasurerName,
      invoiceDate: fromDateColumn(invoice.invoiceDate),
    })
    if (!context) return null

    const sheet = invoice.attendanceSheetId
      ? await tx.attendanceSheet.findUnique({
          where: { id: invoice.attendanceSheetId },
          select: { verifiedAt: true, verifiedAsOffice: true, clubFundBalanceCents: true },
        })
      : null

    return { invoice, context, sheet }
  })

  if (!result) return new NextResponse('Not found', { status: 404 })

  const claim = buildClaim(result.context.input)

  const body =
    document === 'invoice.docx'
      ? await renderInvoice(toInvoiceData(result.context.input, claim))
      : await renderAttendanceSheet(
          toAttendanceSheetData(
            {
              ...result.context.input,
              clubFundBalanceCents:
                result.sheet?.clubFundBalanceCents ?? result.context.input.clubFundBalanceCents,
              verification: result.sheet?.verifiedAt
                ? {
                    name: treasurerName,
                    office: result.sheet.verifiedAsOffice ?? undefined,
                    signedOn: result.sheet.verifiedAt,
                  }
                : undefined,
            },
            claim
          )
        )

  const filename =
    document === 'invoice.docx'
      ? `${result.invoice.documentNo}.docx`
      : `Attendance ${result.context.input.instructor.fullName} ${result.invoice.periodYear}-${String(
          result.invoice.periodMonth
        ).padStart(2, '0')}.docx`

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': DOCX,
      'Content-Disposition': `attachment; filename="${filename.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
