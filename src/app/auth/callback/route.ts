import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { afterSignIn } from '@/core/auth/after-sign-in'
import { logAuthEvent } from '@/core/audit/auth-events'
import { proofFromProviderSignIn } from '@/core/auth/proof'
import { LINKING_COOKIE, readReturnPath } from '@/core/auth/return-path'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  // Where to send people afterwards comes from configuration, not from the
  // request's Host header.
  const origin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')

  // Back from connecting Google to an account already signed in: wherever it
  // went, they return to their profile, told how it went.
  const linking = readReturnPath(request.cookies.get(LINKING_COOKIE)?.value)
  if (linking) {
    const outcome = await finishLinking(request)
    const response = NextResponse.redirect(`${origin}${linking}?google=${outcome}`)
    response.cookies.delete(LINKING_COOKIE)
    return response
  }

  const oauthError = searchParams.get('error')
  if (oauthError) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(oauthError)}`)
  }

  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`)
  }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`)
  }

  // A provider sign-in proves the address only when the provider vouched for
  // it. When it did not, "/" sends the person to confirm it with a code.
  await afterSignIn(supabase, data.user, proofFromProviderSignIn(data.user))

  return NextResponse.redirect(origin)
}

/** 'connected', 'taken' when that Google account has its own login here, or 'failed'. */
async function finishLinking(request: NextRequest): Promise<'connected' | 'taken' | 'failed'> {
  const { searchParams } = request.nextUrl
  if (searchParams.get('error')) {
    const said = `${searchParams.get('error_code') ?? ''} ${searchParams.get('error_description') ?? ''}`
    return /identity_already_exists|already linked/i.test(said) ? 'taken' : 'failed'
  }
  const code = searchParams.get('code')
  if (!code) return 'failed'
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return 'failed'
  await logAuthEvent(data.user.id, 'auth.connect_google')
  return 'connected'
}
