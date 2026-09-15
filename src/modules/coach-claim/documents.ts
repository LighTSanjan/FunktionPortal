/**
 * One month's pair of documents, loaded once and rendered three ways: on
 * screen for review, on a print sheet for the PDF that goes to the Office of
 * Finance, and as the two .docx downloads.
 *
 * All three read this, so what a treasurer approves and what leaves the
 * building cannot come from different places.
 *
 * Nothing here touches a class, a rate, a roster row or an instructor record.
 * A raised month is rebuilt from the invoice, its lines, and the snapshot
 * taken when it was raised — see snapshot.ts for why.
 */
import 'server-only'
import type { Prisma, ExcoOffice } from '@prisma/client'
import { OFFICE_LABELS } from '@/core/access'
import { readSignature } from '@/modules/signatures'
import { readLogo } from '@/modules/branding/logo'
import { fromDateColumn } from '@/lib/date-only'
import {
  MonthNotFrozenError,
  linesFrom,
  readSnapshot,
  sessionsFrom,
  type MonthSnapshot,
} from './snapshot'
import type {
  AttendanceSheetDocData,
  BrandLogo,
  FundSource,
  InvoiceDocData,
  SignatureImage,
} from './types'

/**
 * What prints where the signatory holds no named post.
 *
 * Not "Treasurer". Writing the office of somebody who has not been given it,
 * on the one line the Office of Finance reads to know who stood behind the
 * month, would be the portal making a claim nobody made.
 */
export const NO_OFFICE = 'Exco member'

export interface MonthDocumentsSummary {
  invoiceId: string
  documentNo: string
  referenceNumber: string
  status: string
  periodYear: number
  periodMonth: number
  instructorName: string
  totalCents: number
  fundSource: FundSource
  invoiceDate: Date
  submissionDueAt: Date | null
  submittedToOslAt: Date | null
  signedAt: Date | null
  /** Who verified the sheet, as their name was printed on it. */
  verifiedByName: string | null
  verifiedAt: Date | null
  /**
   * Whether a stored specimen was stamped. False on a verified month means
   * the documents carry an empty rule and have to be signed by hand before
   * they go anywhere.
   */
  stamped: boolean
}

export interface MonthDocuments {
  summary: MonthDocumentsSummary
  invoice: InvoiceDocData
  sheet: AttendanceSheetDocData
}

/** Everything the three renderers need, minus the signature bytes. */
interface Loaded {
  summary: MonthDocumentsSummary
  invoice: InvoiceDocData
  sheet: AttendanceSheetDocData
  signaturePath: string | null
  logoKey: string | null
}

/**
 * Throws MonthNotFrozenError for a month raised before snapshots existed.
 *
 * Refusing beats rendering: a document rebuilt from today's rows is not the
 * document that was signed, and the whole point of this file is that those
 * are the same thing.
 */
export async function loadMonthDocuments(
  tx: Prisma.TransactionClient,
  args: { orgId: string; invoiceId: string }
): Promise<Loaded | null> {
  const invoice = await tx.invoice.findFirst({
    where: { id: args.invoiceId, orgId: args.orgId },
    include: {
      referenceNumber: { select: { formatted: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
      attendanceSheet: true,
    },
  })
  if (!invoice) return null

  const sheetRow = invoice.attendanceSheet
  const snapshot = readSnapshot(sheetRow?.snapshot)
  if (!snapshot) throw new MonthNotFrozenError()

  // The logo the month was raised under. Months raised before logos were
  // recorded in the snapshot take the club's current one: they have never
  // carried a logo at all, so there is no earlier version to preserve.
  const logoKey =
    snapshot.branding?.logoKey ??
    (await tx.organisationSettings.findUnique({ where: { orgId: args.orgId }, select: { brandLogoUrl: true } }))
      ?.brandLogoUrl ??
    null

  const lines = linesFrom(
    invoice.lines.map((line) => ({
      heldOn: fromDateColumn(line.heldOn),
      minutes: line.minutes,
      rateCents: line.rateCents,
      amountCents: line.amountCents,
    }))
  )

  const verifiedAt = sheetRow?.verifiedAt ?? null
  const office = officeLabel(sheetRow?.verifiedAsOffice ?? null)
  // Blank until somebody has signed. A name printed under an empty rule is
  // the club asserting who stood behind the month, and before signing nobody
  // has.
  const verification = verifiedAt
    ? {
        name: sheetRow?.verifiedByName ?? '',
        office,
        signedOn: verifiedAt,
      }
    : undefined

  const summary: MonthDocumentsSummary = {
    invoiceId: invoice.id,
    documentNo: invoice.documentNo,
    referenceNumber: invoice.referenceNumber?.formatted ?? '',
    status: invoice.status,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    instructorName: snapshot.instructor.fullName,
    totalCents: invoice.totalCents,
    fundSource: invoice.fundSource as FundSource,
    invoiceDate: fromDateColumn(invoice.invoiceDate),
    submissionDueAt: invoice.submissionDueAt,
    submittedToOslAt: invoice.submittedToOslAt,
    signedAt: invoice.signedAt,
    verifiedByName: sheetRow?.verifiedByName ?? null,
    verifiedAt,
    stamped: Boolean(sheetRow?.signatureImagePath),
  }

  return {
    summary,
    invoice: toInvoiceDoc(invoice, lines, snapshot, verification),
    sheet: toSheetDoc(invoice, lines, snapshot, sheetRow?.clubFundBalanceCents ?? null, verification),
    signaturePath: verifiedAt ? (sheetRow?.signatureImagePath ?? null) : null,
    logoKey,
  }
}

type InvoiceRow = {
  documentNo: string
  invoiceDate: Date
  periodYear: number
  periodMonth: number
  subtotalCents: number
  gstCents: number
  totalCents: number
  fundSource: string
  referenceNumber: { formatted: string } | null
}

type Verification = { name: string; office: string; signedOn: Date } | undefined

function toInvoiceDoc(
  invoice: InvoiceRow,
  lines: ReturnType<typeof linesFrom>,
  snapshot: MonthSnapshot,
  verification: Verification
): InvoiceDocData {
  return {
    instructor: snapshot.instructor,
    documentNo: invoice.documentNo,
    referenceNumber: invoice.referenceNumber?.formatted ?? '',
    invoiceDate: fromDateColumn(invoice.invoiceDate),
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    lines,
    subtotalCents: invoice.subtotalCents,
    gstCents: invoice.gstCents,
    totalCents: invoice.totalCents,
    fundSource: invoice.fundSource as FundSource,
    treasurerName: verification?.name ?? '',
    endorsement: verification
      ? { office: verification.office, signedOn: verification.signedOn }
      : undefined,
    organisationName: snapshot.organisationName,
    institutionShortName: snapshot.institutionShortName,
    billTo: snapshot.billTo,
  }
}

function toSheetDoc(
  invoice: InvoiceRow,
  lines: ReturnType<typeof linesFrom>,
  snapshot: MonthSnapshot,
  clubFundBalanceCents: number | null,
  verification: Verification
): AttendanceSheetDocData {
  return {
    instructor: snapshot.instructor,
    organisationName: snapshot.organisationName,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    roster: snapshot.roster,
    sessions: sessionsFrom(snapshot),
    lines,
    billedSessionCount: lines.length,
    claimTotalCents: invoice.totalCents,
    fundSource: invoice.fundSource as FundSource,
    referenceNumber: invoice.referenceNumber?.formatted ?? '',
    clubFundBalanceCents: clubFundBalanceCents ?? snapshot.clubFundBalanceCents,
    branding: snapshot.branding,
    verification,
  }
}

/**
 * Fetch the stamped specimen and put it on both documents.
 *
 * Separate from the load because it leaves the database for object storage,
 * and the transaction should not be held open across that.
 */
export async function withSignature(loaded: Loaded): Promise<MonthDocuments> {
  const [signature, logo]: [SignatureImage | null, BrandLogo | null] = await Promise.all([
    readSignature(loaded.signaturePath),
    readLogo(loaded.logoKey),
  ])
  const sheet: AttendanceSheetDocData = logo
    ? { ...loaded.sheet, branding: { ...loaded.sheet.branding, logo } }
    : loaded.sheet
  if (!signature) {
    return { summary: loaded.summary, invoice: loaded.invoice, sheet }
  }
  return {
    summary: loaded.summary,
    invoice: {
      ...loaded.invoice,
      endorsement: { ...loaded.invoice.endorsement, signatureImage: signature },
    },
    sheet: {
      ...sheet,
      verification: sheet.verification
        ? { ...sheet.verification, signatureImage: signature }
        : undefined,
    },
  }
}

/**
 * The post the signatory actually held, or an honest statement that they held
 * none.
 *
 * It used to fall back to "Treasurer", which put a post on the document that
 * nobody had been given — on the one line the Office of Finance reads to know
 * who stood behind the month.
 */
function officeLabel(office: ExcoOffice | null): string {
  return office ? OFFICE_LABELS[office] : NO_OFFICE
}
