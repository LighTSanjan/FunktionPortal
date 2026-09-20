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

/** A button press: the form posted a server action from a page already open. */
function makeAction(path: string): NextRequest {
  const request = new NextRequest(new URL(`http://localhost:3000${path}`), { method: 'POST' })
  request.headers.set('next-action', '60dcd202b1fc640da88256d3145b9b33149646bac8')
  return request
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

  it('remembers the page and its query across signing in', async () => {
    const res = await proxy(makeRequest('/acme/fees?term=t1&edit=1'))
    const cookie = res.cookies.get('funktion-return-to')
    expect(cookie?.value).toBe('/acme/fees?term=t1&edit=1')
    expect(cookie?.httpOnly).toBe(true)
  })

  it('does not remember a prefetch', async () => {
    const request = makeRequest('/acme/fees')
    request.headers.set('next-router-prefetch', '1')
    const res = await proxy(request)
    expect(res.cookies.get('funktion-return-to')).toBeUndefined()
  })

  it('forgets the page once a signed-in visitor arrives somewhere real', async () => {
    mockUser = { id: 'user-1' }
    const request = makeRequest('/acme/fees')
    request.cookies.set('funktion-return-to', '/acme/fees')
    const res = await proxy(request)
    expect(res.headers.get('set-cookie')).toMatch(/funktion-return-to=;/)
  })

  it('keeps the page while a signed-in visitor is still getting in', async () => {
    mockUser = { id: 'user-1' }
    for (const path of ['/verify-email', '/onboarding']) {
      const request = makeRequest(path)
      request.cookies.set('funktion-return-to', '/acme/fees')
      const res = await proxy(request)
      expect(res.headers.get('set-cookie') ?? '', path).not.toMatch(/funktion-return-to/)
    }
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
    for (const path of ['/_next/static/chunk.js', '/favicon.ico', '/robots.txt', '/api/email-assets/logo']) {
      const res = await proxy(makeRequest(path))
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('lets an authenticated request through to a protected route', async () => {
    mockUser = { id: 'user-1' }
    const res = await proxy(makeRequest('/acme/dashboard'))
    expect(res.headers.get('location')).toBeNull()
  })

  // A plain redirect answers a button press with HTML, which the router
  // cannot read: whoever pressed it got "An unexpected response was received
  // from the server." instead of the sign-in page.
  it('turns a button press away in the way the router understands', async () => {
    const request = makeAction('/acme/fees?edit=1')
    const res = await proxy(request)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('x-action-redirect')).toBe(
      `/sign-in?callbackUrl=${encodeURIComponent('/acme/fees')};push`
    )
    // And it still remembers where they were, for after they sign in.
    expect(res.cookies.get('funktion-return-to')?.value).toBe('/acme/fees?edit=1')
  })

  it('sends a button pressed on a sign-in page left open home the same way', async () => {
    mockUser = { id: 'user-1' }
    const res = await proxy(makeAction('/sign-in'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-action-redirect')).toBe('/;push')
  })

  it('still redirects a page load, which is a navigation and not an action', async () => {
    const res = await proxy(makeRequest('/acme/fees'))
    expect(res.status).toBe(307)
    expect(res.headers.get('x-action-redirect')).toBeNull()
  })

  it('does not mistake a plain POST for an action', async () => {
    const res = await proxy(new NextRequest(new URL('http://localhost:3000/acme/fees'), { method: 'POST' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('x-action-redirect')).toBeNull()
  })
})

describe('public files', () => {
  beforeEach(() => {
    mockUser = null
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
  })

  it('serves root-level assets without redirecting to sign-in', async () => {
    for (const path of ['/funktion-icon.png', '/favicon.svg', '/og.png', '/club-photo.jpg']) {
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
