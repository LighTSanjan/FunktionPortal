import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { afterSignIn } from '@/core/auth/after-sign-in'
import { proofFromProviderSignIn } from '@/core/auth/proof'

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

  // A provider sign-in proves the address only when the provider vouched for
  // it. When it did not, "/" sends the person to confirm it with a code.
  await afterSignIn(supabase, data.user, proofFromProviderSignIn(data.user))

  return NextResponse.redirect(origin)
}
