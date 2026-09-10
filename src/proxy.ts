import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const STATIC_PREFIXES = ['/_next/', '/favicon.ico', '/robots.txt', '/sitemap.xml']

const AUTH_PAGES = ['/sign-in', '/sign-up', '/forgot-password']

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isStaticAsset(pathname)) {
    return NextResponse.next()
  }

  return await updateSession(request)
}

async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  let supabaseResponse = NextResponse.next({
    request,
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
            request,
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
    return NextResponse.redirect(signInUrl)
  }

  if (user && matches(pathname, AUTH_PAGES)) {
    return NextResponse.redirect(new URL('/', request.url))
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
