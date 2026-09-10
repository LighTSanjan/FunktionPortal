'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { provisionUser } from '@/core/auth/provision'
import { logAuthEvent, logFailedSignIn } from '@/core/audit/auth-events'

export interface AuthState {
  error: string | null
  /** The account exists but its email has not been confirmed. */
  needsConfirmation?: boolean
  /** Sign-up succeeded and the confirmation email is on its way. */
  awaitingConfirmation?: boolean
  /** Carried so the page can name the address and offer to resend to it. */
  email?: string
}

function friendlyAuthError(message: string, status?: number): string {
  const text = message.toLowerCase()

  if (status === 429 || text.includes('rate limit')) {
    return (
      'Too many confirmation emails have gone out in the last hour — that is a limit on ' +
      'the mail service, not on you. Wait an hour and try again, or sign up with Google.'
    )
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'There is already an account with that email. Sign in instead, or reset your password.'
  }
  if (text.includes('invalid email')) {
    return 'That does not look like a valid email address.'
  }
  if (text.includes('password') && text.includes('short')) {
    return 'That password is too short — use at least 8 characters.'
  }
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) {
    return 'New accounts are turned off at the moment. Ask an exco member to invite you.'
  }
  return message
}

function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    await logFailedSignIn(email)

    // Supabase reports this as its own code; without the branch it reads as a
    // wrong password, which is the single most confusing thing this form can
    // say to somebody whose password is correct.
    if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) {
      return {
        error: 'Confirm your email address before signing in.',
        needsConfirmation: true,
        email,
      }
    }

    return { error: 'That email and password do not match an account.' }
  }

  // Before anything redirects: "/" resolves membership through
  // verifySession(), which needs the application user row to exist.
  await provisionUser(data.user)
  await logAuthEvent(data.user.id, 'auth.sign_in')

  redirect('/')
}

export async function signInWithGoogle(): Promise<never> {
  const supabase = await createSupabaseServer()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl()}/auth/callback`,
      // Without this Google skips its own account chooser once a session
      // exists, which on a shared exco laptop signs you in as whoever used it
      // last — and every document then carries their name.
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error || !data.url) {
    redirect('/sign-in?error=google_unavailable')
  }

  redirect(data.url)
}


export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!name || !email || !password) {
    return { error: 'All fields are required' }
  }

  // Checked here as well as in the browser. The client-side check is a
  // courtesy; this is the one that holds when the form is posted directly.
  if (password !== confirmPassword) {
    return { error: 'Those passwords do not match' }
  }

  // Supabase's own minimum is 6. Eight is the form's stated rule, and a rule
  // the server does not enforce is not a rule.
  if (password.length < 8) {
    return { error: 'Use at least 8 characters' }
  }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${appUrl()}/auth/confirm`,
    },
  })

  if (error) {
    return { error: friendlyAuthError(error.message, error.status), email }
  }

  // With email confirmation switched off, Supabase hands back a session and
  // the account is usable immediately; with it on, there is no session and an
  // email is on its way. Both are normal configurations, and the difference
  // decides what the person has to do next — so it is read rather than assumed.
  if (data.session && data.user) {
    await provisionUser(data.user)
    await logAuthEvent(data.user.id, 'auth.sign_in')
    redirect('/')
  }

  return { error: null, awaitingConfirmation: true, email }
}

export async function resendConfirmation(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string | null)?.trim()
  if (!email) return { error: 'No address to send to' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${appUrl()}/auth/confirm` },
  })

  if (error) {
    return { error: friendlyAuthError(error.message, error.status), email }
  }

  return { error: null, awaitingConfirmation: true, email }
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  await supabase.auth.signOut()
  if (user) {
    await logAuthEvent(user.id, 'auth.sign_out')
  }
  redirect('/sign-in')
}

// Do not reveal whether the supplied address has an account.
export async function requestPasswordReset(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string | null)?.trim()
  if (!email) return { error: 'Enter your email address' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/confirm`,
  })

  // Rate limiting is the one failure worth surfacing: it is the mail service
  // refusing, not the address being wrong, and the person can act on it.
  if (error && (error.status === 429 || /rate limit/i.test(error.message))) {
    return { error: friendlyAuthError(error.message, error.status), email }
  }

  return { error: null, awaitingConfirmation: true, email }
}

export async function setNewPassword(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!password) return { error: 'Enter a new password' }
  if (password !== confirmPassword) return { error: 'Those passwords do not match' }
  if (password.length < 8) return { error: 'Use at least 8 characters' }

  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error:
        'That reset link has expired, or was already used. Ask for a new one and open it from the email.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: friendlyAuthError(error.message, error.status) }

  await logAuthEvent(user.id, 'auth.password_reset')

  redirect('/')
}
