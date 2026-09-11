import { NextResponse } from 'next/server'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { depositFormInput } from '@/modules/fees/deposit-input'
import { buildDepositForm } from '@/modules/fees/deposit-form'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * OSL's Income Deposit Form, filled in.
 *
 * Built at download rather than stored, from the closed collection's own
 * figures. Nothing about a closed collection moves, so rebuilding it produces
 * the same workbook every time — and the treasurer who has already typed on
 * one copy is not silently handed a different one.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'fee.manage')
  const { userId } = await verifySession()

  const termId = new URL(request.url).searchParams.get('term')
  if (!termId) return new NextResponse('Not found', { status: 404 })

  const input = await depositFormInput(userId, org.id, org.name, termId)
  if (!input) return new NextResponse('Not found', { status: 404 })

  const { bytes, filename } = await buildDepositForm(input)

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': `attachment; filename="${filename.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
