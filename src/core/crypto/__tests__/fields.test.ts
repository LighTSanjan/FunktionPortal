// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateKey } from '@47ng/cloak'
import { FieldKeyError, isSealed, needsResealing, openField, sealField } from '../fields'

const saved = process.env.FIELD_ENCRYPTION_KEYS

describe('sealed fields', () => {
  beforeEach(() => {
    process.env.FIELD_ENCRYPTION_KEYS = generateKey()
  })
  afterEach(() => {
    process.env.FIELD_ENCRYPTION_KEYS = saved
  })

  it('round-trips, and the sealed form gives nothing away', () => {
    const sealed = sealField('123-45678-9')
    expect(isSealed(sealed)).toBe(true)
    expect(sealed).not.toContain('45678')
    expect(openField(sealed)).toBe('123-45678-9')
  })

  it('reads plaintext written before encryption as it is', () => {
    expect(openField('000-00000-0')).toBe('000-00000-0')
    expect(needsResealing('000-00000-0')).toBe(true)
  })

  it('opens under an old key after rotation, and knows it needs resealing', () => {
    const old = process.env.FIELD_ENCRYPTION_KEYS!
    const sealed = sealField('123')
    process.env.FIELD_ENCRYPTION_KEYS = `${generateKey()},${old}`
    expect(openField(sealed)).toBe('123')
    expect(needsResealing(sealed)).toBe(true)
    expect(needsResealing(sealField('123'))).toBe(false)
  })

  it('refuses to open a value without its key, rather than show ciphertext', () => {
    const sealed = sealField('123')
    process.env.FIELD_ENCRYPTION_KEYS = generateKey()
    expect(() => openField(sealed)).toThrow(FieldKeyError)
  })

  it('will not save a bank number with no key configured', () => {
    process.env.FIELD_ENCRYPTION_KEYS = ''
    expect(() => sealField('123')).toThrow(FieldKeyError)
  })
})
