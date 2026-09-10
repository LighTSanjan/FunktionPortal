import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { logAuthEvent } from '@/core/audit/auth-events'

// POST prevents third-party GET resources from logging a user out.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  await supabase.auth.signOut()
  if (user) {
    await logAuthEvent(user.id, 'auth.sign_out')
  }

  // 303 so the browser follows with GET rather than re-POSTing to /sign-in.
  return NextResponse.redirect(new URL('/sign-in', request.url), {
    status: 303,
  })
}
