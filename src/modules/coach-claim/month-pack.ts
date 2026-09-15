/**
 * The invoice and the attendance sheet as one Word file: the invoice first,
 * then the sheet on its own page, in its own orientation. They are always
 * sent together, so they are downloaded together.
 */
import { Document, Packer } from 'docx'
import type { AttendanceSheetDocData, InvoiceDocData } from './types'
import { invoiceSection } from './invoice'
import { attendanceSheetSection } from './attendance-sheet'

export function buildMonthPack(invoice: InvoiceDocData, sheet: AttendanceSheetDocData): Document {
  const first = invoiceSection(invoice)
  const second = attendanceSheetSection(sheet)
  return new Document({
    creator: first.meta.creator,
    title: `${first.meta.title} and attendance sheet`,
    description: first.meta.description,
    sections: [first.section, second.section],
  })
}

export async function renderMonthPack(invoice: InvoiceDocData, sheet: AttendanceSheetDocData): Promise<Buffer> {
  return Packer.toBuffer(buildMonthPack(invoice, sheet))
}
