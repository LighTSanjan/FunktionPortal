import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

let mockUser: { id: string } | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockUser } })),
    },
  })),
}))

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`))
}

describe('proxy', () => {
  beforeEach(() => {
    mockUser = null
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
  })

  it('passes auth-protocol endpoints through with no redirect', async () => {
    for (const path of ['/auth/callback', '/auth/confirm', '/api/auth/sign-out']) {
      const res = await proxy(makeRequest(path))
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('redirects an unauthenticated request on a protected route to /sign-in', async () => {
    const res = await proxy(makeRequest('/acme/dashboard'))
    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location).toContain('/sign-in')
    expect(location).toContain(`callbackUrl=${encodeURIComponent('/acme/dashboard')}`)
  })

  it('does not redirect the sign-in page itself when unauthenticated', async () => {
    const res = await proxy(makeRequest('/sign-in'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects an authenticated visitor away from /sign-in', async () => {
    mockUser = { id: 'user-1' }
    const res = await proxy(makeRequest('/sign-in'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/')
  })

  it('bypasses static asset prefixes without redirecting', async () => {
    for (const path of ['/_next/static/chunk.js', '/favicon.ico', '/robots.txt']) {
      const res = await proxy(makeRequest(path))
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('lets an authenticated request through to a protected route', async () => {
    mockUser = { id: 'user-1' }
    const res = await proxy(makeRequest('/acme/dashboard'))
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('public files', () => {
  beforeEach(() => {
    mockUser = null
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
  })

  it('serves root-level assets without redirecting to sign-in', async () => {
    for (const path of ['/funktion-mark.svg', '/favicon.svg', '/og.png', '/club-photo.jpg']) {
      const res = await proxy(makeRequest(path))
      expect(res.headers.get('location'), `${path} should pass through`).toBeNull()
    }
  })

  it('does not let an extension smuggle a real page past the session check', async () => {
    for (const path of ['/funktion/settings.svg', '/a/b.png', '/funktion/dashboard.js']) {
      const res = await proxy(makeRequest(path))
      expect(res.status, `${path} must not bypass`).toBe(307)
      expect(res.headers.get('location'), `${path} must not bypass`).toContain('/sign-in')
    }
  })
})
