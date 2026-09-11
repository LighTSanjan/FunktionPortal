/**
 * The printed deposit form and the .xlsx must say the same thing.
 *
 * Two renderers over one model drift silently, and the failure is invisible
 * precisely because each still looks right on its own. This reduces both to
 * text and compares — the workbook's formulas evaluated the way Excel would,
 * so the money is compared too and not skipped over as "a formula".
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import { htmlText, normalise } from '@/test/document-text'
import { buildDepositForm, type DepositFormInput } from '..'
import { DepositFormPreview } from '../preview/deposit-preview'

const INPUT: DepositFormInput = {
  referenceNumber: 'INC26-097-0001',
  organisationName: 'Some Society',
  eventName: 'Trimester 1 subscriptions',
  eventDate: '15 September 2026',
  description: 'Membership subscriptions collected from members for Trimester 1',
  wbsElement: 'PN-00097-A3006-A3006-R00',
  lines: [
    { description: 'Membership subscription — full trimester', unitPriceCents: 7000, quantity: 42 },
    { description: 'Membership subscription — half trimester', unitPriceCents: 3500, quantity: 3 },
    { description: 'Membership subscription — exchange student', unitPriceCents: 3500, quantity: 1 },
  ],
  submittedBy: { name: 'A Treasurer', studentId: '1000456', designation: 'Treasurer' },
  gstBasisPoints: 900,
}

/** Every cell of the sheet in document order, formulas evaluated. */
async function sheetText(bytes: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  const shared = await sharedStrings(zip)
  const currencyStyles = await currencyStyleIndexes(zip)

  const cells = [
    ...xml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g),
  ].map(([whole, ref, body = '']) => ({
    ref,
    body,
    shared: /\bt="s"/.test(whole),
    style: Number(/\bs="(\d+)"/.exec(whole)?.[1] ?? NaN),
  }))

  const byRef = new Map(cells.map((cell) => [cell.ref, cell]))

  /**
   * Resolve a cell to a number, following formulas as far as they go. D20
   * sums D17:D19, and each of those is itself =B17*C17 — evaluating in one
   * pass over the literals gives every total as zero, which is exactly the
   * sort of quietly-passing comparison this test exists to prevent.
   */
  const resolving = new Set<string>()
  function numberAt(ref: string): number {
    const cell = byRef.get(ref)
    if (!cell) return 0
    if (resolving.has(ref)) throw new Error(`Circular reference at ${ref}`)

    const formula = /<f>([\s\S]*?)<\/f>/.exec(cell.body)
    if (!formula) {
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell.body)
      return value && !cell.shared ? Number(value[1]) : 0
    }

    resolving.add(ref)
    try {
      return evaluate(formula[1], numberAt)
    } finally {
      resolving.delete(ref)
    }
  }

  const out: string[] = []
  for (const cell of cells) {
    // Currency comes from the cell's own number format, not from its column:
    // D holds sub-totals in the breakdown and GL account numbers above it.
    const asMoney = currencyStyles.has(cell.style)

    if (/<f>/.test(cell.body)) {
      out.push(asMoney ? money(numberAt(cell.ref)) : String(numberAt(cell.ref)))
      continue
    }
    const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cell.body)
    if (inline) {
      out.push(decode(inline[1]))
      continue
    }
    const value = /<v>([\s\S]*?)<\/v>/.exec(cell.body)
    if (!value) continue
    if (cell.shared) {
      out.push(shared[Number(value[1])] ?? '')
      continue
    }
    out.push(asMoney ? money(Number(value[1])) : value[1])
  }

  return out
}

/** Which cellXfs entries carry the template's currency format. */
async function currencyStyleIndexes(zip: JSZip): Promise<Set<number>> {
  const xml = await zip.file('xl/styles.xml')!.async('string')
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)![1]
  const entries = [...cellXfs.matchAll(/<xf\b[^>]*\/>|<xf\b[\s\S]*?<\/xf>/g)]
  const out = new Set<number>()
  entries.forEach((entry, index) => {
    // 164 is the template's own _("$"* #,##0.00_) format.
    if (/numFmtId="164"/.test(entry[0])) out.add(index)
  })
  return out
}

/**
 * Enough of a formula engine for this template: SUM over a column range, a
 * product of two cells, and the two GST divisions. Anything else should fail
 * loudly rather than silently compare as zero.
 */
function evaluate(formula: string, valueAt: (ref: string) => number): number {
  const sum = /^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(formula)
  if (sum) {
    let total = 0
    for (let row = Number(sum[2]); row <= Number(sum[4]); row++) {
      total += valueAt(`${sum[1]}${row}`)
    }
    return total
  }
  const product = /^([A-Z]+\d+)\*([A-Z]+\d+)$/.exec(formula)
  if (product) return valueAt(product[1]) * valueAt(product[2])

  const gst = /^([A-Z]+\d+)\/109\*(\d+)$/.exec(formula)
  if (gst) return (valueAt(gst[1]) / 109) * Number(gst[2])

  throw new Error(`The drift test cannot evaluate "${formula}"`)
}

function money(amount: number): string {
  return `$${amount.toLocaleString('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

async function sharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file('xl/sharedStrings.xml')
  if (!file) return []
  const xml = await file.async('string')
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) =>
    [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => decode(t)).join('')
  )
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

describe('the printed deposit form and the workbook', () => {
  it('say exactly the same thing', async () => {
    const { bytes, model } = await buildDepositForm(INPUT)
    const markup = renderToStaticMarkup(<DepositFormPreview model={model} />)

    expect(normalise(htmlText(markup))).toBe(normalise(await sheetText(bytes)))
  })

  it('agrees with the workbook about the money', async () => {
    // The sheet's own arithmetic, evaluated: gross/109*100 and gross/109*9.
    // 42 × $70 + 3 × $35 + 1 × $35 = $3,080.00.
    const { model } = await buildDepositForm(INPUT)
    expect(model.breakdownTotal).toBe('$3,080.00')
    expect(model.netOfGst).toBe('$2,825.69')
    expect(model.gst).toBe('$254.31')
    expect(model.totalWithGst).toBe('$3,080.00')
  })

  it('keeps the club mark out of the text', async () => {
    // A logo is decoration on a form whose wording is the recipient's. It
    // must not add a word, or the two renderings stop matching.
    const { bytes, model } = await buildDepositForm(INPUT)
    const markup = renderToStaticMarkup(
      <DepositFormPreview model={model} logoUrl="https://example.test/mark.svg" />
    )
    expect(normalise(htmlText(markup))).toBe(normalise(await sheetText(bytes)))
  })
})
