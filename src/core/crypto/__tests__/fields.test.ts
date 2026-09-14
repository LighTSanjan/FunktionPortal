import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { FieldKeyError, isSealed, needsResealing, openField, sealField } from '../fields'

const key = (id: string) => `${id}:${randomBytes(32).toString('base64')}`
const saved = process.env.FIELD_ENCRYPTION_KEYS

describe('sealed fields', () => {
  beforeEach(() => {
    process.env.FIELD_ENCRYPTION_KEYS = key('k1')
  })
  afterEach(() => {
    process.env.FIELD_ENCRYPTION_KEYS = saved
  })

  it('round-trips, and the sealed form gives nothing away', () => {
    const sealed = sealField('123-45678-9', 'instructors.bank_account_no')
    expect(isSealed(sealed)).toBe(true)
    expect(sealed).not.toContain('45678')
    expect(openField(sealed, 'instructors.bank_account_no')).toBe('123-45678-9')
  })

  it('never seals the same number the same way twice', () => {
    expect(sealField('123', 'instructors.bank_account_no')).not.toBe(sealField('123', 'instructors.bank_account_no'))
  })

  it('refuses to open a value moved into another column', () => {
    const sealed = sealField('123-45678-9', 'instructors.bank_account_no')
    expect(() => openField(sealed, 'attendance_sheets.snapshot.bank_account_no')).toThrow()
  })

  it('refuses a tampered value', () => {
    const sealed = sealField('123-45678-9', 'instructors.bank_account_no')
    const parts = sealed.split(':')
    const body = Buffer.from(parts[5], 'base64url')
    body[0] ^= 1
    parts[5] = body.toString('base64url')
    expect(() => openField(parts.join(':'), 'instructors.bank_account_no')).toThrow()
  })

  it('reads plaintext written before encryption as it is', () => {
    expect(openField('000-00000-0', 'instructors.bank_account_no')).toBe('000-00000-0')
    expect(needsResealing('000-00000-0')).toBe(true)
  })

  it('opens under an old key after rotation, and knows it needs resealing', () => {
    const old = process.env.FIELD_ENCRYPTION_KEYS!
    const sealed = sealField('123', 'instructors.bank_account_no')
    process.env.FIELD_ENCRYPTION_KEYS = `${key('k2')},${old}`
    expect(openField(sealed, 'instructors.bank_account_no')).toBe('123')
    expect(needsResealing(sealed)).toBe(true)
    expect(needsResealing(sealField('123', 'instructors.bank_account_no'))).toBe(false)
  })

  it('will not save a bank number with no key configured', () => {
    process.env.FIELD_ENCRYPTION_KEYS = ''
    expect(() => sealField('123', 'instructors.bank_account_no')).toThrow(FieldKeyError)
  })
})
