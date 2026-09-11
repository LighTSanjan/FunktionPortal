/**
 * A very small SpreadsheetML writer: enough to fill in a form, not enough to
 * author one.
 *
 * The Income Deposit Form is OSL's file. Rebuilding it from scratch would
 * produce something that merely resembles what they accept — different fonts,
 * different borders, a different GST formula — and the whole point of a Class
 * B document is that it looks exactly like the one they have been accepting
 * for years. So the template ships as-is and this writes values into it.
 *
 * Everything here operates on the sheet XML as text. That is deliberate: a
 * general XML round-trip would reorder attributes and drop the parts Excel
 * cares about but a DOM does not.
 */

/** Where a value goes and how it should be typed when it gets there. */
export interface CellWrite {
  /** A1-style reference, e.g. "B4". */
  ref: string
  value: string | number
  /** Index into the template's cellXfs. Omitted keeps whatever is there. */
  style?: number
}

/**
 * Note the lazy quantifier before the alternation. Greedy, it consumes the
 * closing "/" of a self-closing <row .../> — the empty rows the template is
 * full of — and then satisfies itself with the ">…</row>" branch instead,
 * swallowing every row up to the next real close. The same mistake in
 * cellsOf() below silently merged three cells into one.
 */
const ROW_RE = /<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g

function columnOf(ref: string): string {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!match) throw new Error(`Not a cell reference: ${ref}`)
  return match[1]
}

function rowOf(ref: string): number {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!match) throw new Error(`Not a cell reference: ${ref}`)
  return Number(match[2])
}

/** 1 -> "A", 27 -> "AA". The inverse of columnIndex. */
function columnName(index: number): string {
  let name = ''
  let remaining = index
  while (remaining > 0) {
    const rest = (remaining - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    remaining = Math.floor((remaining - 1) / 26)
  }
  return name
}

/** "A" -> 1, "B" -> 2, "AA" -> 27. Used only to order cells within a row. */
function columnIndex(column: string): number {
  let n = 0
  for (const character of column) n = n * 26 + (character.charCodeAt(0) - 64)
  return n
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Text is written inline rather than into the shared string table.
 *
 * The table is shared with every other cell in the workbook, so appending to
 * it means rewriting indices that the untouched cells still point at. An
 * inline string is local to the cell that holds it, which is exactly the
 * scope of what is being changed.
 */
function cellXml(write: CellWrite): string {
  const style = write.style === undefined ? '' : ` s="${write.style}"`
  if (typeof write.value === 'number') {
    return `<c r="${write.ref}"${style}><v>${write.value}</v></c>`
  }
  return `<c r="${write.ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(write.value)}</t></is></c>`
}

function formulaXml(ref: string, formula: string, style?: number): string {
  const s = style === undefined ? '' : ` s="${style}"`
  return `<c r="${ref}"${s}><f>${escapeXml(formula)}</f></c>`
}

/** Replace a row's whole body with the cells given, in column order. */
function rebuildRow(rowXml: string, cells: Map<string, string>): string {
  const ordered = [...cells.entries()]
    .sort((a, b) => columnIndex(columnOf(a[0])) - columnIndex(columnOf(b[0])))
    .map(([, xml]) => xml)
    .join('')

  const openTag = /^<row\b[^>]*?(\/?)>/.exec(rowXml)
  if (!openTag) throw new Error('Unparseable row')
  const open = openTag[0].replace(/\/>$/, '>')
  return `${open}${ordered}</row>`
}

/** Every cell of a row, keyed by reference, as raw XML. */
function cellsOf(rowXml: string): Map<string, string> {
  const cells = new Map<string, string>()
  const re = /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(rowXml)) !== null) cells.set(match[1], match[0])
  return cells
}

export class Sheet {
  constructor(private xml: string) {}

  /**
   * Write values into cells, creating them where the template leaves them
   * empty. An existing cell keeps its style unless one is given, because the
   * template's own formatting is the thing being preserved.
   */
  set(writes: readonly CellWrite[], options: { likeRow?: number } = {}): this {
    const byRow = new Map<number, CellWrite[]>()
    for (const write of writes) {
      const row = rowOf(write.ref)
      const list = byRow.get(row)
      if (list) list.push(write)
      else byRow.set(row, [write])
    }

    this.xml = this.xml.replace(ROW_RE, (rowXml, rowNumber: string) => {
      const writesHere = byRow.get(Number(rowNumber))
      if (!writesHere) return rowXml

      const cells = cellsOf(rowXml)
      for (const write of writesHere) {
        const existing = cells.get(write.ref)
        const style =
          write.style ?? (existing ? Number(/\bs="(\d+)"/.exec(existing)?.[1] ?? NaN) : undefined)
        cells.set(write.ref, cellXml({ ...write, style: Number.isNaN(style) ? undefined : style }))
      }
      byRow.delete(Number(rowNumber))
      return rebuildRow(rowXml, cells)
    })

    // Rows the template does not contain at all — a breakdown line beyond the
    // three the form ships with has no <row> element until something is put
    // in it.
    for (const [rowNumber, writesHere] of byRow) {
      const cells = new Map<string, string>()
      for (const write of writesHere) cells.set(write.ref, cellXml(write))
      const ordered = [...cells.entries()]
        .sort((a, b) => columnIndex(columnOf(a[0])) - columnIndex(columnOf(b[0])))
        .map(([, xml]) => xml)
        .join('')
      // Carry the model row's own attributes — chiefly its height, which the
      // template sets explicitly on the breakdown rows. Without it a fourth
      // fee tier is visibly shorter than the three above it.
      this.insertRowXml(
        rowNumber,
        `<row r="${rowNumber}"${this.attributesOf(options.likeRow)}>${ordered}</row>`
      )
    }

    return this
  }

  /** A row's attributes, minus its number, for cloning onto a new one. */
  private attributesOf(rowNumber: number | undefined): string {
    if (rowNumber === undefined) return ''
    const match = new RegExp(
      `<row\\b[^>]*\\br="${rowNumber}"[^>]*?(?:/>|>)`
    ).exec(this.xml)
    if (!match) return ''
    return match[0]
      .replace(/^<row\b/, '')
      .replace(/\/?>$/, '')
      .replace(/\sr="\d+"/, '')
  }

  setFormula(ref: string, formula: string): this {
    const targetRow = rowOf(ref)
    this.xml = this.xml.replace(ROW_RE, (rowXml, rowNumber: string) => {
      if (Number(rowNumber) !== targetRow) return rowXml
      const cells = cellsOf(rowXml)
      const existing = cells.get(ref)
      const style = existing ? Number(/\bs="(\d+)"/.exec(existing)?.[1] ?? NaN) : NaN
      cells.set(ref, formulaXml(ref, formula, Number.isNaN(style) ? undefined : style))
      return rebuildRow(rowXml, cells)
    })
    return this
  }

  /**
   * Push every row at or below `from` down by `count`, carrying cell
   * references, merged ranges and formula ranges with them.
   *
   * Needed because the template has room for three breakdown lines. A club
   * with four fee tiers is not an error, and silently dropping the fourth
   * would understate what was banked — which is the one thing this document
   * exists to state correctly.
   */
  insertRows(from: number, count: number): this {
    if (count <= 0) return this

    this.xml = this.xml.replace(ROW_RE, (rowXml, rowNumber: string) => {
      const row = Number(rowNumber)
      if (row < from) return rowXml
      const moved = row + count
      return rowXml
        .replace(/(<row\b[^>]*\br=")\d+(")/, `$1${moved}$2`)
        .replace(/(<c\b[^>]*\br=")([A-Z]+)(\d+)(")/g, (_m, head, col, r, tail) =>
          Number(r) >= from ? `${head}${col}${Number(r) + count}${tail}` : `${head}${col}${r}${tail}`
        )
    })

    this.xml = this.xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g,
      (_m, c1, r1, c2, r2) => {
        const a = Number(r1) >= from ? Number(r1) + count : Number(r1)
        const b = Number(r2) >= from ? Number(r2) + count : Number(r2)
        return `<mergeCell ref="${c1}${a}:${c2}${b}"/>`
      })

    // Formulas that point below the insertion move with their targets. The
    // template's are all simple ranges and products, which is why a rewrite
    // this blunt is safe here and would not be in a real workbook.
    this.xml = this.xml.replace(/<f>([\s\S]*?)<\/f>/g, (_m, formula: string) =>
      `<f>${formula.replace(/\b([A-Z]+)(\d+)\b/g, (ref, col: string, r: string) =>
        Number(r) >= from ? `${col}${Number(r) + count}` : ref
      )}</f>`
    )

    return this
  }

  private insertRowXml(rowNumber: number, xml: string): void {
    const rows: { row: number; index: number }[] = []
    let match: RegExpExecArray | null
    const re = new RegExp(ROW_RE.source, 'g')
    while ((match = re.exec(this.xml)) !== null) {
      rows.push({ row: Number(match[1]), index: match.index })
    }
    const after = rows.filter((r) => r.row > rowNumber)[0]
    if (after) {
      this.xml = this.xml.slice(0, after.index) + xml + this.xml.slice(after.index)
      return
    }
    this.xml = this.xml.replace('</sheetData>', `${xml}</sheetData>`)
  }

  /**
   * Excel caches the last computed value of every formula. Those caches are
   * now wrong — the template's were computed against empty cells — and Excel
   * shows the cache, not the formula, until something forces a recalculation.
   * Dropping the cached values makes it recalculate on open.
   */
  dropCachedValues(): this {
    this.xml = this.xml.replace(
      /(<c\b[^>]*>)(<f>[\s\S]*?<\/f>)<v>[\s\S]*?<\/v>(<\/c>)/g,
      '$1$2$3'
    )
    return this
  }

  /**
   * Rewrite <dimension> to cover what the sheet now holds.
   *
   * It is a declared bounding box, and inserting rows leaves it claiming the
   * sheet ends where the template ended. Excel recalculates it and shrugs;
   * stricter readers are entitled not to, and a workbook that opens
   * everywhere is the whole reason this fills OSL's file rather than
   * generating one.
   */
  fixDimension(): this {
    let maxRow = 0
    let maxColumn = 1
    for (const [, ref] of this.xml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)) {
      maxRow = Math.max(maxRow, rowOf(ref))
      maxColumn = Math.max(maxColumn, columnIndex(columnOf(ref)))
    }
    if (maxRow === 0) return this

    this.xml = this.xml.replace(
      /<dimension ref="[^"]*"\s*\/>/,
      `<dimension ref="A1:${columnName(maxColumn)}${maxRow}"/>`
    )
    return this
  }

  toString(): string {
    return this.xml
  }
}
