/** The fee summary preview and its .docx must say the same thing. */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { docxText, htmlText, normalise } from '@/test/document-text'
import { buildFeeSummary, type FeeSummaryDocData } from '../summary-doc'
import { FeeSummaryPreview } from '../preview/summary-preview'

const DATA: FeeSummaryDocData = {
  organisationName: 'Testing Society',
  termName: 'Trimester 2 2026',
  rows: [
    {
      memberName: 'Aiyana Bell',
      tierLabel: 'Full term',
      amountCents: 70_00,
      statusLabel: 'Confirmed',
      confirmedOn: new Date(2026, 5, 2),
      unofficial: false,
    },
    {
      memberName: 'Bo Tan',
      tierLabel: 'Half term',
      amountCents: 35_00,
      statusLabel: 'Confirmed',
      confirmedOn: new Date(2026, 5, 3),
      unofficial: true,
    },
    {
      memberName: 'Chandra Raj',
      tierLabel: 'Full term',
      amountCents: 70_00,
      statusLabel: 'Not paid',
      unofficial: false,
    },
  ],
  bankedCents: 70_00,
  unofficialCents: 35_00,
  outstandingCents: 70_00,
  referenceNumber: 'INC26-097-0001',
  finalCollectionAt: new Date(2026, 5, 5),
  branding: { bandColors: ['F05820', '304890'] },
  preparedBy: { name: 'Wan Mei Ling', office: 'Treasurer', signedOn: new Date(2026, 5, 6) },
}

const render = (data: FeeSummaryDocData) =>
  normalise(htmlText(renderToStaticMarkup(<FeeSummaryPreview data={data} />)))

describe('the fee summary preview', () => {
  it('renders the same text as the .docx', () => {
    expect(render(DATA)).toBe(normalise(docxText(buildFeeSummary(DATA))))
  })

  it('carries what the record is for', () => {
    const html = render(DATA)
    // The point of the document: who, at what tier, how much, confirmed when.
    expect(html).toContain('aiyana bell')
    expect(html).toContain('half term')
    expect(html).toContain('$70.00')
    expect(html).toContain('2 june 2026')
    expect(html).toContain('inc26-097-0001')
  })

  it('names the rows behind the outside-OSL total, not just the total', () => {
    // A figure nobody can check against the rows above it is a figure
    // somebody will have to ask the treasurer about.
    const html = render(DATA)
    expect(html).toContain('bo tan')
    expect(html).toContain('(outside osl)')
  })

  it('states money held outside the OSL accounts separately, or not at all', () => {
    // Real money the club can spend, with no WBS element to quote against it.
    expect(render(DATA)).toContain('held outside the osl accounts: $35.00')

    const allOfficial = { ...DATA, unofficialCents: 0 }
    const html = render(allOfficial)
    expect(html).not.toContain('held outside')
    expect(normalise(docxText(buildFeeSummary(allOfficial)))).toBe(html)
  })

  it('leaves the signature block empty before anybody has prepared it', () => {
    const draft = { ...DATA, preparedBy: undefined, referenceNumber: undefined }
    const html = render(draft)
    expect(html).toContain('prepared by')
    expect(html).not.toContain('inc26-097-0001')
    expect(normalise(docxText(buildFeeSummary(draft)))).toBe(html)
  })
})
