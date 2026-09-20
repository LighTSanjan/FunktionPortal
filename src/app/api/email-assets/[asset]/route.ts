import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'

const ASSETS = {
  logo: { path: join(process.cwd(), 'docs/assets/funktion-logo.png'), type: 'image/png' },
  crew: { path: join(process.cwd(), 'public/eu-gene-battle.jpg'), type: 'image/jpeg' },
} as const

/**
 * Public, deliberately allow-listed images used by authentication emails.
 *
 * Keeping these behind the app URL means local Mailpit and production email
 * both use the same template. It also avoids a second public Storage bucket
 * whose missing objects previously left every message with broken images.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> }
) {
  const { asset } = await params
  const selected = ASSETS[asset as keyof typeof ASSETS]
  if (!selected) return new Response('Not found', { status: 404 })

  const bytes = await readFile(selected.path)
  return new Response(bytes, {
    headers: {
      'Content-Type': selected.type,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
