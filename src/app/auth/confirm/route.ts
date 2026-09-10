import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { provisionUser } from '@/core/auth/provision'
import { logAuthEvent } from '@/core/audit/auth-events'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/sign-in?error=invalid_link`)
  }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_expired`)
  }

  await provisionUser(data.user)
  await logAuthEvent(data.user.id, 'auth.sign_in')

  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  return NextResponse.redirect(origin)
}
