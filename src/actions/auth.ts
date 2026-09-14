'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { afterSignIn } from '@/core/auth/after-sign-in'
import { proofFromEmailCode } from '@/core/auth/proof'
import { mayJoin, normaliseEmail } from '@/core/auth/eligibility'
import { takeAttempt } from '@/core/auth/throttle'
import { logAuthEvent } from '@/core/audit/auth-events'
import { alert } from '@/core/alerts'

/**
 * Signing in, without passwords.
 *
 * Three ways in: a code emailed to the address, Microsoft (every SUTD
 * address is a Microsoft 365 account), or Google. There is no password
 * sign-in because a password is the one credential that proves nothing about
 * the address it was set against — and while Supabase's "Confirm email" is
 * off, it is how somebody would take over another person's account. Codes,
 * not links: Outlook's Safe Links opens every link in an email before the
 * person does, and a one-time link opened once is spent.
 */
export interface CodeState {
  error: string | null
  /** The code is on its way to this address; show the code box. */
  sentTo?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
}

export async function requestEmailCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = normaliseEmail(String(formData.get('email') ?? ''))
  if (!EMAIL.test(email)) return { error: 'That does not look like an email address.' }

  const ip = await clientIp()
  const allowed = await takeAttempt([
    { key: `code-send:email:${email}`, max: 5, windowSeconds: 3600 },
    { key: `code-send:ip:${ip}`, max: 30, windowSeconds: 3600 },
  ])
  if (!allowed) {
    await alert('throttle_tripped', { what: 'code requests', email, ip })
    return { error: 'Too many codes asked for. Wait an hour, or use Microsoft or Google instead.' }
  }

  // Only an address that would be let in may create an account. Anybody else
  // gets the same answer and no email: the page does not say which addresses
  // have accounts, and Supabase does not fill up with accounts for strangers.
  const shouldCreateUser = await mayJoin(email)

  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser } })

  if (error) {
    if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) {
      return {
        error:
          'The mail service is refusing to send more codes right now. Wait a minute and try again, or use Microsoft or Google.',
      }
    }
    // "Signups not allowed for otp": an address that is neither on the list
    // nor has an account. Answered exactly like success.
    if (!/signups? not allowed|user not found/i.test(error.message)) {
      console.error('[auth] signInWithOtp failed', error.status, error.message)
      return { error: 'The code could not be sent. Try again in a minute.' }
    }
  }

  return { error: null, sentTo: email }
}

export async function verifyEmailCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = normaliseEmail(String(formData.get('email') ?? ''))
  const token = String(formData.get('code') ?? '').replace(/\s+/g, '')
  if (!EMAIL.test(email)) return { error: 'Start again with your email address.' }
  if (!/^\d{6,10}$/.test(token)) return { error: 'The code is the number in the email.', sentTo: email }

  const ip = await clientIp()
  const allowed = await takeAttempt([
    { key: `code-verify:email:${email}`, max: 10, windowSeconds: 900 },
    { key: `code-verify:ip:${ip}`, max: 60, windowSeconds: 900 },
  ])
  if (!allowed) {
    await alert('throttle_tripped', { what: 'wrong codes', email, ip })
    return { error: 'Too many wrong codes. Wait fifteen minutes and ask for a new one.', sentTo: email }
  }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error || !data.user) {
    return { error: 'That code is wrong or has expired. Ask for a new one.', sentTo: email }
  }

  await afterSignIn(supabase, data.user, proofFromEmailCode())
  redirect('/')
}

const PROVIDERS = { google: 'Google', azure: 'Microsoft' } as const
type Provider = keyof typeof PROVIDERS

function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}

export async function signInWithProvider(formData: FormData): Promise<never> {
  const provider = String(formData.get('provider')) as Provider
  if (!(provider in PROVIDERS)) redirect('/sign-in')

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${appUrl()}/auth/callback`,
      // Microsoft hands over no email address without this scope.
      scopes: provider === 'azure' ? 'openid email profile' : undefined,
      // Without this the provider skips its own account chooser once a
      // session exists, which on a shared exco laptop signs you in as whoever
      // used it last — and every document then carries their name.
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error || !data.url) {
    redirect(`/sign-in?error=${provider}_unavailable`)
  }

  redirect(data.url)
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
