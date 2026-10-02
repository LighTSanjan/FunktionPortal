/** The portal's own address, for links that leave and come back (OAuth). */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}
