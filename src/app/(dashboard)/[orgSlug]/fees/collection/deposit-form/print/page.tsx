import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { getOrgBranding } from '@/core/org/queries'
import { depositFormInput } from '@/modules/fees/deposit-input'
import { buildDepositForm } from '@/modules/fees/deposit-form'
import { DepositFormPreview } from '@/modules/fees/deposit-form/preview/deposit-preview'

export const dynamic = 'force-dynamic'

/**
 * The deposit form laid out to print, for the browser's own PDF writer.
 *
 * The .xlsx is the working copy — it is what gets corrected, and what OSL can
 * reopen. This is the same form as a fixed page, for filing, attaching, or
 * handing over. A test holds the two to the same text, so the PDF cannot
 * quietly say something the workbook does not.
 */
export default async function PrintDepositFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ term?: string }>
}) {
  const { orgSlug } = await params
  const { term: termId } = await searchParams
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'fee.manage')
  const { userId } = await verifySession()

  if (!termId) notFound()

  const input = await depositFormInput(userId, org.id, org.name, termId)
  if (!input) notFound()

  const [{ model, warnings }, branding] = await Promise.all([
    buildDepositForm(input),
    getOrgBranding(org.id),
  ])

  return (
    <div className="mx-auto max-w-[1080px] space-y-4">
      <div
        data-print="hide"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3"
      >
        <div>
          <p className="text-[13.5px] font-medium">
            {input.eventName}
            {input.referenceNumber ? ` · ${input.referenceNumber}` : ''}
          </p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Print this page and choose &ldquo;Save as PDF&rdquo;. Send the spreadsheet when OSL
            need to work in it, this when they need to file it.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={`/${orgSlug}/fees/collection/deposit-form?term=${termId}`}
            className="text-[13px] font-medium text-accent-600 underline-offset-4 hover:underline"
          >
            Spreadsheet
          </a>
          <Link
            href={`/${orgSlug}/fees/collection?term=${termId}`}
            className="text-[13px] font-medium text-text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Back to the collection
          </Link>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul
          data-print="hide"
          className="space-y-1.5 rounded-[var(--radius-md)] border border-warning/25 bg-warning/8 px-4 py-3"
        >
          {warnings.map((warning) => (
            <li key={warning} className="text-[13px] leading-relaxed">
              {warning}
            </li>
          ))}
        </ul>
      )}

      <DepositFormPreview model={model} logoUrl={branding.logoSignedUrl} />
    </div>
  )
}
