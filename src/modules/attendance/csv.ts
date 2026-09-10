/** Parse exported attendance CSVs, including quoted commas, lines and quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  // Excel exports may include a byte-order mark before the first header.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (source[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\r') { /* CRLF: the newline does the work */ }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += char
  }

  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }

  return rows
}
