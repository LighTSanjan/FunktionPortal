import { describe, expect, it } from 'vitest'
import { assertIsolatedTestEnv } from '../../scripts/test/playwright-env'

const localEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/funktion',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:55432/funktion',
  APP_USER_DATABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:58000',
  MAILPIT_URL: 'http://localhost:58025',
}

describe('browser test environment guard', () => {
  it('accepts only the dedicated local stack ports', () => {
    expect(() => assertIsolatedTestEnv(localEnv)).not.toThrow()
  })

  it('refuses a hosted database before Playwright can start', () => {
    expect(() =>
      assertIsolatedTestEnv({
        ...localEnv,
        DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/production',
      })
    ).toThrow(/throwaway local test stack/)
  })

  it('refuses the normal local development database port', () => {
    expect(() =>
      assertIsolatedTestEnv({
        ...localEnv,
        APP_USER_DATABASE_URL: 'postgresql://app:test@localhost:5432/funktion',
      })
    ).toThrow(/port 55432/)
  })
})
