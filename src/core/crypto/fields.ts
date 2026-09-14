/**
 * Encryption for the few columns a database dump must not give away.
 *
 * Row-level security decides who may query a row; it does nothing for a
 * leaked backup, a stolen DATABASE_URL, or a support session on the database.
 * A coach's bank account number is the field whose leak does real harm, so
 * it is sealed in the application with AES-256-GCM before it reaches
 * Postgres, under a key the database never sees.
 *
 *   enc:v1:<key id>:<iv>:<auth tag>:<ciphertext>     (base64url parts)
 *
 * The column name is bound in as associated data, so a sealed value cannot be
 * copied into a different column and opened there.
 *
 * Keys come from FIELD_ENCRYPTION_KEYS, "id:base64key" pairs separated by
 * commas, newest first. New values are sealed under the first; any listed key
 * opens. To rotate: put a new key first, run scripts/db/encrypt-fields.ts,
 * then drop the old one.
 *
 * A value without the prefix is read as plaintext, so rows written before
 * encryption keep working until the backfill script seals them.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

export type SealedColumn = 'instructors.bank_account_no' | 'attendance_sheets.snapshot.bank_account_no'

interface Key {
  id: string
  bytes: Buffer
}

export class FieldKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldKeyError'
  }
}

function keys(): Key[] {
  const raw = process.env.FIELD_ENCRYPTION_KEYS ?? ''
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, material] = entry.split(':')
      const bytes = Buffer.from(material ?? '', 'base64')
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || bytes.length !== 32) {
        throw new FieldKeyError('FIELD_ENCRYPTION_KEYS must be "id:<32 bytes, base64>" pairs, comma-separated')
      }
      return { id, bytes }
    })
  return parsed
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function sealField(plain: string, column: SealedColumn): string {
  const [current] = keys()
  if (!current) {
    throw new FieldKeyError(
      'FIELD_ENCRYPTION_KEYS is not set, so bank details cannot be saved. Generate one with: ' +
        'node -e "console.log(\'k1:\' + require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', current.bytes, iv)
  cipher.setAAD(Buffer.from(column))
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${current.id}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

export function openField(stored: string, column: SealedColumn): string {
  if (!isSealed(stored)) return stored

  const [keyId, iv, tag, ciphertext] = stored.slice(PREFIX.length).split(':')
  const key = keys().find((candidate) => candidate.id === keyId)
  if (!key) {
    throw new FieldKeyError(`No key "${keyId}" in FIELD_ENCRYPTION_KEYS to open ${column}`)
  }
  const decipher = createDecipheriv('aes-256-gcm', key.bytes, Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(column))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}

export function sealOptional(plain: string | null | undefined, column: SealedColumn): string | null {
  return plain ? sealField(plain, column) : null
}

export function openOptional(stored: string | null | undefined, column: SealedColumn): string | null {
  return stored ? openField(stored, column) : null
}

/** Whether a sealed value is under a key other than the current one. */
export function needsResealing(stored: string): boolean {
  if (!isSealed(stored)) return true
  const [current] = keys()
  return Boolean(current) && stored.slice(PREFIX.length).split(':')[0] !== current.id
}
