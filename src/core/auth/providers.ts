import 'server-only'

/**
 * Which sign-in providers Supabase has switched on.
 *
 * Read from Supabase rather than configured twice, so a button is never shown
 * for a provider that would only answer with an error. This decides what the
 * sign-in page offers, nothing more: whether a sign-in proves anything is
 * decided in proof.ts from what the provider actually returned.
 */
export interface EnabledProviders {
  email: boolean
  google: boolean
  azure: boolean
}

export async function enabledProviders(): Promise<EnabledProviders> {
  const fallback = { email: true, google: false, azure: false }
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return fallback
    const settings = (await response.json()) as { external?: Record<string, boolean> }
    const external = settings.external ?? {}
    return { email: external.email !== false, google: Boolean(external.google), azure: Boolean(external.azure) }
  } catch {
    return fallback
  }
}
