/**
 * A one-time sign-in link for an existing account, for when email is not set
 * up yet — or is down.
 *
 * Only somebody holding SUPABASE_SECRET_KEY can run this, and that key can do
 * anything to the project already, so the link proves nothing new about them.
 * It works once and expires in an hour. It is printed to your terminal and
 * sent nowhere: do not paste it into chats or tickets, because whoever opens
 * it first is signed in as that account.
 *
 * usage: npm run auth:link -- <email>
 */
import '../load-env'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email) throw new Error('usage: npm run auth:link -- <email>')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set')

  const admin = createClient(url, secret, { auth: { persistSession: false } })
  // magiclink, not signup: an account that does not exist yet is not created
  // here. New people come in through the sign-in page.
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.hashed_token) {
    throw new Error(`No link: ${error?.message ?? 'Supabase returned no token'} (does ${email} have an account?)`)
  }

  const app = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const link = `${app}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink`
  console.log(`\nOne-time sign-in link for ${email} (expires in an hour, works once):\n\n  ${link}\n`)
  console.log('Open it in the browser where you want to be signed in. Do not share it.\n')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
