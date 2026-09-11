/**
 * The preview and the .docx must say the same thing.
 *
 * The whole value of showing somebody a document before they sign it rests on
 * the thing they looked at being the thing that gets sent. Two renderers over
 * one data model can drift silently — a figure formatted differently here, a
 * line added there — and the failure is invisible precisely because the
 * preview looks right.
 *
 * So both are reduced to their text and compared. Layout is allowed to
 * differ; content is not.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { docxText, htmlText, normalise } from '@/test/document-text'
import { buildInvoice } from '../../invoice'
import { buildAttendanceSheet } from '../../attendance-sheet'
import { InvoicePreview } from '../invoice-preview'
import { AttendanceSheetPreview } from '../attendance-preview'
import type { InvoiceDocData, AttendanceSheetDocData } from '../../types'

const INSTRUCTOR = {
  fullName: 'Rina Halim',
  addressLines: ['12 Jalan Sempit', 'Singapore 123456'],
  phone: '+65 8000 0001',
  email: 'rina@example.com',
  bankName: 'DBS',
  bankAccountNo: '000-11111-2',
  danceStyle: 'Locking',
}

const LINES = [
  { heldOn: new Date(2026, 4, 4), durationMinutes: 90, hourlyRateCents: 9000, amountCents: 13500 },
  { heldOn: new Date(2026, 4, 11), durationMinutes: 90, hourlyRateCents: 9000, amountCents: 13500 },
]

const INVOICE: InvoiceDocData = {
  instructor: INSTRUCTOR,
  documentNo: 'RH15062026',
  referenceNumber: 'IV26-097-0011',
  invoiceDate: new Date(2026, 5, 15),
  periodYear: 2026,
  periodMonth: 5,
  lines: LINES,
  subtotalCents: 27000,
  gstCents: 0,
  totalCents: 27000,
  fundSource: 'INCOME',
  treasurerName: 'Wan Mei Ling',
  organisationName: 'Testing Society',
  institutionShortName: 'SUTD',
  billTo: { name: 'A University', addressLines: ['1 Campus Way', 'Singapore 000000'] },
}

const SHEET: AttendanceSheetDocData = {
  instructor: INSTRUCTOR,
  organisationName: 'Testing Society',
  periodYear: 2026,
  periodMonth: 5,
  roster: [
    { id: 'm1', fullName: 'Aiyana Bell' },
    { id: 'm2', fullName: 'Bo Tan' },
  ],
  sessions: [
    {
      heldOn: new Date(2026, 4, 4),
      durationMinutes: 90,
      instructorPresent: true,
      presentMemberIds: new Set(['m1', 'm2']),
      presentCount: 2,
    },
    {
      heldOn: new Date(2026, 4, 11),
      durationMinutes: 90,
      instructorPresent: true,
      presentMemberIds: new Set(['m1']),
      presentCount: 1,
    },
    {
      // A self-practice date: on the sheet, on no invoice.
      heldOn: new Date(2026, 4, 18),
      durationMinutes: 90,
      instructorPresent: false,
      presentMemberIds: new Set(['m2']),
      presentCount: 1,
    },
  ],
  lines: LINES,
  billedSessionCount: 2,
  claimTotalCents: 27000,
  fundSource: 'INCOME',
  referenceNumber: 'IV26-097-0011',
  clubFundBalanceCents: 361516,
  branding: { tagline: 'A dance club', bandColors: ['F05820', '304890'] },
  verification: { name: 'Wan Mei Ling', office: 'Treasurer', signedOn: new Date(2026, 5, 15) },
}

describe('the invoice preview', () => {
  it('renders the same text as the .docx', () => {
    expect(normalise(htmlText(renderToStaticMarkup(<InvoicePreview data={INVOICE} />)))).toBe(
      normalise(docxText(buildInvoice(INVOICE)))
    )
  })

  it('carries the figures a reader is being asked to check', () => {
    const html = normalise(htmlText(renderToStaticMarkup(<InvoicePreview data={INVOICE} />)))
    // Named explicitly so that a shared mistake in both renderers — which the
    // comparison above would happily agree on — still fails.
    expect(html).toContain('iv26-097-0011')
    expect(html).toContain('rh15062026')
    expect(html).toContain('total due $270.00')
    expect(html).toContain('15 june 2026')
    expect(html).toContain('000-11111-2')
    expect(html).toContain('testing society, sutd')
  })

  it('prints the GST rows only when there is GST', () => {
    const plain = normalise(htmlText(renderToStaticMarkup(<InvoicePreview data={INVOICE} />)))
    expect(plain).not.toContain('subtotal')

    const taxed = { ...INVOICE, gstCents: 2430, totalCents: 29430 }
    const html = normalise(htmlText(renderToStaticMarkup(<InvoicePreview data={taxed} />)))
    expect(html).toContain('subtotal $270.00')
    expect(html).toContain('gst $24.30')
    expect(normalise(docxText(buildInvoice(taxed)))).toBe(html)
  })
})

describe('the attendance sheet preview', () => {
  it('renders the same text as the .docx', () => {
    expect(normalise(htmlText(renderToStaticMarkup(<AttendanceSheetPreview data={SHEET} />)))).toBe(
      normalise(docxText(buildAttendanceSheet(SHEET)))
    )
  })

  it('shows the self-practice date as taught by nobody', () => {
    const html = normalise(htmlText(renderToStaticMarkup(<AttendanceSheetPreview data={SHEET} />)))
    // Three dates on the grid, two on the claim: the difference is the point.
    expect(html).toContain('4 may')
    expect(html).toContain('18 may')
    expect(html).toContain('total coach claim: $270.00')
    expect(html).toContain('$90.00/hr x 2 sessions x 1.5 hr/session')
  })

  it('leaves the signature rule empty when nothing has been signed', () => {
    const unsigned = { ...SHEET, verification: undefined }
    const html = normalise(
      htmlText(renderToStaticMarkup(<AttendanceSheetPreview data={unsigned} />))
    )
    expect(html).toContain('office: treasurer')
    expect(normalise(docxText(buildAttendanceSheet(unsigned)))).toBe(html)
  })
})
