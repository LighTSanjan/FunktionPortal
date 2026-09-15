import { describe, it, expect } from 'vitest'
import { readReturnPath } from '../return-path'

describe('readReturnPath', () => {
  it('keeps a page of the portal with its query', () => {
    expect(readReturnPath('/funktion/fees?term=abc&edit=1')).toBe('/funktion/fees?term=abc&edit=1')
    expect(readReturnPath('/funktion/fees/collection')).toBe('/funktion/fees/collection')
    expect(readReturnPath('/funktion/fees?_rsc=1x2y')).toBe('/funktion/fees')
  })

  it('refuses anything that could leave the site', () => {
    expect(readReturnPath('https://evil.example/funktion')).toBeNull()
    expect(readReturnPath('//evil.example/funktion')).toBeNull()
    expect(readReturnPath('/\\evil.example')).toBeNull()
    expect(readReturnPath('funktion/fees')).toBeNull()
    expect(readReturnPath(' /funktion/fees')).toBeNull()
    expect(readReturnPath(`/fees${String.fromCharCode(10)}x`)).toBeNull()
  })

  it('never returns somewhere that is part of signing in', () => {
    for (const raw of [
      '/',
      '/sign-in',
      '/sign-in?x=1',
      '/sign-up',
      '/verify-email',
      '/onboarding',
      '/auth/callback',
      '/api/auth/sign-out',
    ]) {
      expect(readReturnPath(raw), raw).toBeNull()
    }
  })

  it('refuses nothing and nonsense', () => {
    expect(readReturnPath(null)).toBeNull()
    expect(readReturnPath(undefined)).toBeNull()
    expect(readReturnPath('')).toBeNull()
    expect(readReturnPath(`/${'a'.repeat(3000)}`)).toBeNull()
  })
})
