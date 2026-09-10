import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { provisionUser } from '@/core/auth/provision'
import { logAuthEvent } from '@/core/audit/auth-events'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

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

  await provisionUser(data.user)
  await logAuthEvent(data.user.id, 'auth.sign_in')

  return NextResponse.redirect(origin)
}
