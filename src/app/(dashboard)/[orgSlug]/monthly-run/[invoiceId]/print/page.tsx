import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession, getOrgContext, requirePagePermission } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { loadMonthDocuments, withSignature } from '@/modules/coach-claim/documents'
import { MonthNotFrozenError } from '@/modules/coach-claim/snapshot'
import { InvoicePreview } from '@/modules/coach-claim/preview/invoice-preview'
import { AttendanceSheetPreview } from '@/modules/coach-claim/preview/attendance-preview'
import { MONTHS } from '@/modules/coach-claim/theme'

export const dynamic = 'force-dynamic'

/**
 * The month's pack, and nothing else, ready for the browser's PDF writer.
 *
 * §3.1.2 asks for one PDF. The club has no document converter and no licence
 * for one, but every browser can print to PDF — so the pack is a page laid out
 * to print, in the order the Office of Finance reads it: the coach's invoice
 * first, then the attendance sheet it rests on.
 */
export default async function PrintMonthPage({
  params,
}: {
  params: Promise<{ orgSlug: string; invoiceId: string }>
}) {
  const { orgSlug, invoiceId } = await params
  const { org } = await getOrgContext(orgSlug)
  await requirePagePermission(org, 'claim.generate')
  const { userId } = await verifySession()

  const loaded = await dbAs(userId, (tx) =>
    loadMonthDocuments(tx, { orgId: org.id, invoiceId })
  ).catch((error) => {
    // The month's own page explains this properly; here it is simply not
    // printable, and a 404 says that without pretending otherwise.
    if (error instanceof MonthNotFrozenError) return null
    throw error
  })
  if (!loaded) notFound()

  const { summary, invoice, sheet } = await withSignature(loaded)
  const period = `${MONTHS[summary.periodMonth - 1]} ${summary.periodYear}`

  return (
    <div className="mx-auto max-w-[1080px] space-y-4">
      <div
        data-print="hide"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3"
      >
        <div>
          <p className="text-[13.5px] font-medium">
            {summary.referenceNumber} &middot; {summary.instructorName}, {period}
          </p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Print this page and choose &ldquo;Save as PDF&rdquo;. Both documents are here, in
            order, as one file.
          </p>
        </div>
        <Link
          href={`/${orgSlug}/monthly-run/${invoiceId}`}
          className="text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
        >
          Back to the month
        </Link>
      </div>

      {!summary.verifiedAt && (
        <p
          data-print="hide"
          className="rounded-[var(--radius-md)] border border-warning/25 bg-warning/8 px-4 py-3 text-[13px] leading-relaxed"
        >
          This month has not been verified yet, so the attendance sheet will print with an
          empty signature rule.
        </p>
      )}

      <InvoicePreview data={invoice} />
      <AttendanceSheetPreview data={sheet} />
    </div>
  )
}
