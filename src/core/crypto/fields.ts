/**
 * Encryption for the few columns a database dump must not give away.
 *
 * Row-level security decides who may query a row; it does nothing for a
 * leaked backup, a stolen DATABASE_URL, or a support session on the database.
 * A coach's bank account number is the field whose leak does real harm, so
 * it is sealed in the application before it reaches Postgres, under a key the
 * database never sees.
 *
 * The cryptography is @47ng/cloak (AES-256-GCM, keys identified by
 * fingerprint): v1.aesgcm256.<fingerprint>.<iv>.<ciphertext>. This file only
 * decides where the keys come from and what a plaintext row means.
 *
 * Keys come from FIELD_ENCRYPTION_KEYS: cloak keys (k1.aesgcm256.…), comma-
 * separated, newest first. New values are sealed under the first; any listed
 * key opens. To rotate: put a new key first, run `npm run db:encrypt-fields --
 * --apply`, then drop the old one. Generate a key with `npx @47ng/cloak generate`.
 *
 * A value that is not a cloak message is read as plaintext, so rows written
 * before encryption keep working until the backfill script seals them.
 */
import {
  decryptStringSync,
  encryptStringSync,
  findKeyForMessage,
  getMessageKeyFingerprint,
  makeKeychainSync,
  parseCloakedString,
  parseKeySync,
} from '@47ng/cloak'

export class FieldKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldKeyError'
  }
}

function configuredKeys(): string[] {
  return (process.env.FIELD_ENCRYPTION_KEYS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === 'string' && parseCloakedString(value) !== false
}

export function sealField(plain: string): string {
  const [current] = configuredKeys()
  if (!current) {
    throw new FieldKeyError(
      'FIELD_ENCRYPTION_KEYS is not set, so bank details cannot be saved. Generate a key with: npx @47ng/cloak generate'
    )
  }
  return encryptStringSync(plain, current)
}

export function openField(stored: string): string {
  if (!isSealed(stored)) return stored
  const keychain = makeKeychainSync(configuredKeys())
  try {
    return decryptStringSync(stored, findKeyForMessage(stored, keychain))
  } catch (error) {
    throw new FieldKeyError(
      `Could not open a sealed value (key ${getMessageKeyFingerprint(stored)}): ${error instanceof Error ? error.message : error}`
    )
  }
}

export function sealOptional(plain: string | null | undefined): string | null {
  return plain ? sealField(plain) : null
}

export function openOptional(stored: string | null | undefined): string | null {
  return stored ? openField(stored) : null
}

/** Plaintext, or sealed under a key other than the current one. */
export function needsResealing(stored: string): boolean {
  if (!isSealed(stored)) return true
  const [current] = configuredKeys()
  return Boolean(current) && getMessageKeyFingerprint(stored) !== parseKeySync(current).fingerprint
}
