/**
 * Reducing a document to its text, whichever renderer produced it.
 *
 * Used to hold each on-screen preview against the .docx it stands in for. The
 * whole value of showing somebody a document before they sign it rests on the
 * thing they looked at being the thing that gets sent, and two renderers over
 * one data model can drift silently — the failure is invisible precisely
 * because the preview still looks right.
 */
import type { Document } from 'docx'

/**
 * The text of a .docx body, in document order.
 *
 * Only the body: a File also carries core properties — title, creator, and two
 * timestamps of the moment it was built — and comparing those against a web
 * page would be comparing the wrapper, not the document.
 */
export function docxText(doc: Document): string[] {
  return walk((doc as unknown as { documentWrapper: unknown }).documentWrapper)
}

/**
 * Attribute bags hold their values in a plain object rather than an array,
 * which is what separates `xml:space="preserve"` from the text of the
 * document.
 */
function walk(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  if (node && typeof node === 'object') {
    const root = (node as { root?: unknown }).root
    if (root !== undefined) {
      if (Array.isArray(root)) walk(root, out)
      return out
    }
    for (const value of Object.values(node)) walk(value, out)
  }
  return out
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function htmlText(markup: string): string[] {
  return decodeEntities(markup.replace(/<[^>]*>/g, ' ')).split(' ')
}

/**
 * The comparable form: one lowercase string with runs of whitespace and the
 * label punctuation collapsed.
 *
 * The two renderers legitimately differ in how a label is glued to its value —
 * the .docx emits "Date:  " and "15 June 2026" as separate runs, the page
 * emits them as separate elements — so joining and collapsing is what makes
 * the comparison about content rather than about markup.
 */
export function normalise(parts: string[]): string {
  return parts
    .join(' ')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*/g, ': ')
    .trim()
    .toLowerCase()
}
