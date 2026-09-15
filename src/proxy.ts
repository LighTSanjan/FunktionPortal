import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { RETURN_PATH_COOKIE, RETURN_PATH_MAX_AGE_SECONDS, readReturnPath } from '@/core/auth/return-path'

const STATIC_PREFIXES = ['/_next/', '/favicon.ico', '/robots.txt', '/sitemap.xml']

const AUTH_PAGES = ['/sign-in', '/sign-up']

const AUTH_FLOW_PATHS = [
  '/auth/callback',
  '/auth/confirm',
  '/api/auth/sign-out',
]

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// Only root-level files bypass auth. Matching any dot would also exempt paths
// such as /funktion/settings.svg.
const PUBLIC_FILE = /^\/[A-Za-z0-9._-]+\.(?:svg|png|jpe?g|webp|avif|gif|ico|txt|xml|webmanifest|woff2?)$/

function isStaticAsset(pathname: string): boolean {
  return STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || PUBLIC_FILE.test(pathname)
}

/**
 * A fresh nonce per request, and a policy that runs only scripts carrying it.
 * Next.js stamps the nonce onto its own scripts when it sees it in the
 * request's policy; the root layout stamps the one inline script it adds.
 * Without it, 'unsafe-inline' meant any HTML injection anywhere would run.
 */
function contentSecurityPolicy(nonce: string): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co'
  const devEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    // Style attributes are everywhere in the UI; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isStaticAsset(pathname)) {
    return NextResponse.next()
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const policy = contentSecurityPolicy(nonce)
  request.headers.set('x-nonce', nonce)
  request.headers.set('Content-Security-Policy', policy)

  const response = await updateSession(request)
  response.headers.set('Content-Security-Policy', policy)
  return response
}

function isPrefetch(request: NextRequest): boolean {
  return request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch'
}

async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (matches(pathname, AUTH_FLOW_PATHS)) {
    return supabaseResponse
  }

  if (!user && !matches(pathname, AUTH_PAGES)) {
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    const response = NextResponse.redirect(signInUrl)
    // Remembered across every step of getting in, so the page they opened is
    // the page they land on. See return-path.ts.
    const returnTo = readReturnPath(`${pathname}${request.nextUrl.search}`)
    if (returnTo && !isPrefetch(request)) {
      response.cookies.set(RETURN_PATH_COOKIE, returnTo, {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: RETURN_PATH_MAX_AGE_SECONDS,
      })
    }
    return response
  }

  if (user && matches(pathname, AUTH_PAGES)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Arrived somewhere real: whatever they were on their way to is either
  // this page or no longer wanted. A prefetch is not arriving.
  if (user && request.cookies.has(RETURN_PATH_COOKIE) && readReturnPath(pathname) && !isPrefetch(request)) {
    supabaseResponse.cookies.delete(RETURN_PATH_COOKIE)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (browser icon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
