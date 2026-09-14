import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { afterSignIn } from '@/core/auth/after-sign-in'
import { proofFromEmailCode } from '@/core/auth/proof'

/**
 * A sign-in link from an email, for anybody whose mail client leaves links
 * alone. Opening it proves the address exactly as typing the code does.
 *
 * Password recovery links are not honoured: there are no passwords.
 */
const SIGN_IN_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite']

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  // Where to send people afterwards comes from configuration, not from the
  // request's Host header.
  const origin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (!tokenHash || !type || !SIGN_IN_TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}/sign-in?error=invalid_link`)
  }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_expired`)
  }

  await afterSignIn(supabase, data.user, proofFromEmailCode())

  return NextResponse.redirect(origin)
}
