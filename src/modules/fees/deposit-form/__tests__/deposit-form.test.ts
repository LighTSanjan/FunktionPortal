import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildDepositForm, type DepositFormInput } from '..'

/** Every cell of the generated sheet, keyed by reference, plus its style. */
async function cells(
  bytes: Buffer
): Promise<Map<string, string> & { styleOf: (ref: string) => number | undefined }> {
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  const shared = await sharedStrings(zip)

  const styles = new Map<string, number>()
  const out = Object.assign(new Map<string, string>(), {
    styleOf: (ref: string) => styles.get(ref),
  })
  const re = /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    const [whole, ref, body = ''] = match
    const style = /\bs="(\d+)"/.exec(whole)
    if (style) styles.set(ref, Number(style[1]))
    const formula = /<f>([\s\S]*?)<\/f>/.exec(body)
    if (formula) {
      out.set(ref, `=${formula[1]}`)
      continue
    }
    const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body)
    if (inline) {
      out.set(ref, decode(inline[1]))
      continue
    }
    const value = /<v>([\s\S]*?)<\/v>/.exec(body)
    if (!value) continue
    out.set(ref, /\bt="s"/.test(whole) ? (shared[Number(value[1])] ?? '') : value[1])
  }
  return out
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

function input(overrides: Partial<DepositFormInput> = {}): DepositFormInput {
  return {
    referenceNumber: 'INC26-097-0001',
    organisationName: 'Some Society',
    eventName: 'Term 1 subscriptions',
    eventDate: '1 September 2026',
    description: 'Membership subscriptions for Term 1',
    wbsElement: 'PN-00097-A3006-A3006-R00',
    lines: [
      { description: 'Full term membership', unitPriceCents: 7000, quantity: 42 },
      { description: 'Half term membership', unitPriceCents: 3500, quantity: 3 },
    ],
    submittedBy: { name: 'A Treasurer', studentId: '1000456', designation: 'Treasurer' },
    gstBasisPoints: 900,
    ...overrides,
  }
}

describe('the Income Deposit Form', () => {
  it("keeps OSL's own labels, GL accounts and GST formulas", async () => {
    const { bytes } = await buildDepositForm(input())
    const sheet = await cells(bytes)

    expect(sheet.get('A1')).toBe('SUTD Student Organisation')
    expect(sheet.get('A4')).toBe('A. Finance Reference No.:')
    // The GL account codes are OSL's and are not ours to derive.
    expect(sheet.get('D11')).toBe('80403001')
    expect(sheet.get('D12')).toBe('30203003')
    // Their GST arithmetic, untouched.
    expect(sheet.get('B11')).toBe('=D20/109*100')
    expect(sheet.get('B12')).toBe('=D20/109*9')
  })

  it('writes the figures into the blanks', async () => {
    const { bytes } = await buildDepositForm(input())
    const sheet = await cells(bytes)

    expect(sheet.get('B4')).toBe('INC26-097-0001')
    expect(sheet.get('B5')).toBe('Some Society')
    expect(sheet.get('B6')).toBe('Term 1 subscriptions')
    expect(sheet.get('B7')).toBe('1 September 2026')
    expect(sheet.get('C11')).toBe('PN-00097-A3006-A3006-R00')

    expect(sheet.get('A17')).toBe('Full term membership')
    expect(sheet.get('B17')).toBe('70')
    expect(sheet.get('C17')).toBe('42')
    expect(sheet.get('A18')).toBe('Half term membership')

    expect(sheet.get('B24')).toBe('A Treasurer')
    expect(sheet.get('B25')).toBe('1000456')
    expect(sheet.get('B26')).toBe('Treasurer')
  })

  it('does not eat the cells that follow an empty one', async () => {
    // Row 20 is "Total", A20 label, B20 and C20 empty and self-closing, D20
    // the sum. A greedy quantifier in the cell matcher let B20 swallow C20
    // and D20, which produced a workbook with two D20 cells in it — one of
    // them styleless, and the one Excel read.
    const { bytes } = await buildDepositForm(input())
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    const row20 = /<row\b[^>]*\br="20"[\s\S]*?<\/row>/.exec(xml)![0]

    expect(row20.match(/r="D20"/g)).toHaveLength(1)
    // And it kept the template's currency style rather than losing it.
    expect(row20).toContain('<c r="D20" s="10">')
  })

  it('totals only the rows that have something in them', async () => {
    // The template ships three breakdown rows. Two lines must not leave the
    // third inside the total's range with a stale product formula in it.
    const { bytes } = await buildDepositForm(input())
    const sheet = await cells(bytes)
    expect(sheet.get('D20')).toBe('=SUM(D17:D18)')
  })

  it('grows the breakdown when a club has more tiers than the form has rows', async () => {
    const { bytes } = await buildDepositForm(
      input({
        lines: [
          { description: 'Full', unitPriceCents: 7000, quantity: 40 },
          { description: 'Half', unitPriceCents: 3500, quantity: 3 },
          { description: 'Exchange', unitPriceCents: 3500, quantity: 1 },
          { description: 'Alumni', unitPriceCents: 2000, quantity: 2 },
          { description: 'Staff', unitPriceCents: 1000, quantity: 1 },
        ],
      })
    )
    const sheet = await cells(bytes)

    // Two rows were inserted, so the total and everything under it moved.
    expect(sheet.get('A21')).toBe('Staff')
    expect(sheet.get('D21')).toBe('=B21*C21')
    // And in the template's own currency style, boxed like the rows above —
    // a sub-total that prints as a bare 2000 outside the grid is the sort of
    // thing OSL send back.
    expect(sheet.styleOf('D21')).toBe(sheet.styleOf('D19'))
    expect(sheet.get('D22')).toBe('=SUM(D17:D21)')
    expect(sheet.get('A25')).toBe('H. Submitted by:')
    expect(sheet.get('B26')).toBe('A Treasurer')
    // OSL's GST cells still point at the total wherever it has ended up.
    expect(sheet.get('B11')).toBe('=D22/109*100')
    expect(sheet.get('B12')).toBe('=D22/109*9')
  })

  it('declares the range it actually covers once rows are inserted', async () => {
    // <dimension> is a bounding box the reader is told to expect. Excel
    // recalculates it and shrugs; stricter readers are entitled not to, and
    // a workbook that opens everywhere is the whole reason this fills OSL's
    // file instead of generating one.
    const { bytes } = await buildDepositForm(
      input({
        lines: [
          { description: 'Full', unitPriceCents: 7000, quantity: 40 },
          { description: 'Half', unitPriceCents: 3500, quantity: 3 },
          { description: 'Exchange', unitPriceCents: 3500, quantity: 1 },
          { description: 'Alumni', unitPriceCents: 2000, quantity: 2 },
        ],
      })
    )
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(/<dimension ref="([^"]*)"/.exec(xml)![1]).toBe('A1:E27')
  })

  it('gives an inserted breakdown row the height of the ones above it', async () => {
    const { bytes } = await buildDepositForm(
      input({
        lines: [
          { description: 'Full', unitPriceCents: 7000, quantity: 40 },
          { description: 'Half', unitPriceCents: 3500, quantity: 3 },
          { description: 'Exchange', unitPriceCents: 3500, quantity: 1 },
          { description: 'Alumni', unitPriceCents: 2000, quantity: 2 },
        ],
      })
    )
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    const row20 = /<row\b[^>]*\br="20"[^>]*>/.exec(xml)![0]
    expect(row20).toContain('ht="19.95"')
    expect(row20).toContain('customHeight="1"')
  })

  it('says so when the club is not on the rate the form hard-codes', async () => {
    const { warnings } = await buildDepositForm(input({ gstBasisPoints: 800 }))
    expect(warnings.join(' ')).toContain('8.00%')
    expect(warnings.join(' ')).toContain('9%')
  })

  it('leaves the student ID blank rather than inventing one', async () => {
    const { bytes, warnings } = await buildDepositForm(
      input({ submittedBy: { name: 'A Treasurer', studentId: null, designation: 'Treasurer' } })
    )
    const sheet = await cells(bytes)
    expect(sheet.get('B25')).toBe('')
    expect(warnings.join(' ')).toContain('student ID')
  })

  it('refuses to state that nothing was collected', async () => {
    await expect(buildDepositForm(input({ lines: [] }))).rejects.toThrow(/breakdown/)
  })
})
