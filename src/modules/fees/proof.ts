/**
 * Payment screenshots.
 *
 * The evidence base for every confirmation, and the one category of file in
 * the portal that must never leave it: a PayNow confirmation carries the
 * payer's name and often part of an account number, and Drive permissions are
 * granted per folder — there is no folder setting that means "the exco, and
 * nobody else, ever".
 *
 * Keys are derived from the term and the member, never accepted from a caller.
 */
import 'server-only'
import { randomUUID } from 'crypto'
import { getStorageUnscoped } from '@/core/storage'
import { readImageInfo, UnreadableImageError, type ImageFormat } from '@/modules/coach-claim/image-size'

const PREFIX = 'fee-proof'

/** A phone screenshot is comfortably under this. */
export const MAX_PROOF_BYTES = 5_000_000

const CONTENT_TYPE: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
}

export class ProofRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProofRejected'
  }
}

/**
 * The file's own header decides the format, not the browser's content type,
 * which is taken from the extension and is a claim rather than a fact.
 */
export function validateProof(bytes: Uint8Array): ImageFormat {
  if (bytes.byteLength === 0) throw new ProofRejected('That file is empty.')
  if (bytes.byteLength > MAX_PROOF_BYTES) {
    throw new ProofRejected(
      `That image is over ${MAX_PROOF_BYTES / 1_000_000} MB. A screenshot is usually far under it.`
    )
  }
  try {
    return readImageInfo(bytes).format
  } catch (error) {
    if (error instanceof UnreadableImageError) {
      throw new ProofRejected(
        'That has to be a screenshot — a PNG or a JPEG. A PDF will not display for the exco.'
      )
    }
    throw error
  }
}

export async function putProof(
  termId: string,
  memberId: string,
  bytes: Uint8Array,
  format: ImageFormat
): Promise<string> {
  // A fresh key every time. Overwriting in place would leave a replaced
  // screenshot reachable from a cached URL, and make "what did they show us
  // in March" unanswerable.
  const key = `${PREFIX}/${termId}/${memberId}/${randomUUID()}.${format}`
  await getStorageUnscoped().upload(key, bytes, CONTENT_TYPE[format])
  return key
}

/**
 * The screenshot itself, read server-side.
 *
 * Not a signed URL. A signed URL is a bearer token in an address bar: it
 * carries no identity of its own, so copying it out of the browser hands the
 * screenshot to anybody for as long as it lasts. These carry the payer's name
 * and often part of an account number, and the rule is that nobody outside
 * the exco ever sees one — which means the authorisation has to be on every
 * request that fetches it, not only on the request that minted a link.
 */
export async function readProof(
  key: string | null
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!key) return null
  const format: ImageFormat = key.endsWith('.jpg') ? 'jpg' : 'png'
  try {
    return { bytes: await getStorageUnscoped().download(key), contentType: CONTENT_TYPE[format] }
  } catch {
    return null
  }
}
