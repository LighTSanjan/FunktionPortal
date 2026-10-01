import 'server-only'

import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js'
import type { ExcoOffice } from '@prisma/client'
import { dbAdmin } from '@/core/db/admin'

/**
 * The hosted demo: a copy of the portal with a made-up club, where anybody
 * with the link can sign in as one of a few people with a click.
 *
 * Two things have to be true before any of this runs, and both are checked
 * on every sign-in:
 *
 *   - DEMO_MODE is "true" in the deployment's environment, and
 *   - the database holds exactly one club, and its slug is `demo`.
 *
 * The second is what makes a stray DEMO_MODE on the real deployment harmless:
 * the real club's slug is not `demo`, so nothing is created and nobody is
 * signed in. Demo addresses are on a `.test` domain, which no real person can
 * own (RFC 2606).
 */
const DEMO_ORG_SLUG = 'demo'
const DEMO_DOMAIN = 'demo.funktion.test'

export type DemoPersona = 'treasurer' | 'president' | 'member' | 'newcomer'

interface PersonaSpec {
  email: string
  name: string
  exco?: ExcoOffice
}

const PERSONAS: Record<Exclude<DemoPersona, 'newcomer'>, PersonaSpec> = {
  treasurer: { email: `treasurer@${DEMO_DOMAIN}`, name: 'Tess Tan', exco: 'TREASURER' },
  president: { email: `president@${DEMO_DOMAIN}`, name: 'Priya Rao', exco: 'PRESIDENT' },
  member: { email: `ada@${DEMO_DOMAIN}`, name: 'Ada Lee' },
}

export function isDemo(): boolean {
  return process.env.DEMO_MODE === 'true'
}

export function isDemoPersona(value: unknown): value is DemoPersona {
  return value === 'treasurer' || value === 'president' || value === 'member' || value === 'newcomer'
}

/** Whether this database is the demo's. See the note at the top. */
export async function isDemoDatabase(): Promise<boolean> {
  const orgs = await dbAdmin.organisation.findMany({ select: { slug: true }, take: 2 })
  return orgs.length === 1 && orgs[0].slug === DEMO_ORG_SLUG
}

function adminClient(): SupabaseClient {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is needed for demo sign-in.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Sign the browser in as a demo person, on the caller's cookie-bound client.
 *
 * The account is made on first use. A newcomer is a fresh account every
 * time, so everybody who tries it sees the welcome screen from the start.
 */
export async function signInDemoPersona(supabase: SupabaseClient, persona: DemoPersona): Promise<SupabaseUser> {
  const spec: PersonaSpec =
    persona === 'newcomer'
      ? { email: `new-${randomBytes(4).toString('hex')}@${DEMO_DOMAIN}`, name: 'New Person' }
      : PERSONAS[persona]

  const admin = adminClient()
  const { error: createError } = await admin.auth.admin.createUser({
    email: spec.email,
    email_confirm: true,
    user_metadata: { name: spec.name },
  })
  if (createError && !/already|exists|registered/i.test(createError.message)) {
    throw new Error(`Could not make the demo account: ${createError.message}`)
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: spec.email,
  })
  if (linkError || !link.properties?.hashed_token) {
    throw new Error(`Could not start the demo session: ${linkError?.message ?? 'no token'}`)
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: link.properties.hashed_token,
  })
  if (error || !data.user) throw new Error(`Could not sign in to the demo: ${error?.message ?? 'no user'}`)
  return data.user
}

/** The demo's exco hold their office, whatever a tester did with the access screen. */
export async function settleDemoPersona(userId: string, persona: DemoPersona): Promise<void> {
  if (persona === 'newcomer' || persona === 'member') return
  const office = PERSONAS[persona].exco!
  await dbAdmin.organisationMembership.updateMany({
    where: { userId, organisation: { slug: DEMO_ORG_SLUG } },
    data: { role: 'EXCO', office, isActive: true },
  })
}
