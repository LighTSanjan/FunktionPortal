import type { NextConfig } from 'next'

// The Content-Security-Policy is set per request in src/proxy.ts, because it
// carries a fresh nonce each time.

const nextConfig: NextConfig = {
  // No `deploymentId` here on purpose. It is what makes a tab left open
  // across a deploy reload itself instead of pressing buttons the new build
  // has never heard of — but Vercel sets it for git deployments once Skew
  // Protection is on in the project settings, and setting it by hand
  // overrides that with a value Vercel reserves. Turn it on there; what still
  // gets through is caught by src/core/ui/stale-client.ts.
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "playwright-core", "@sparticuz/chromium"],
  experimental: {
    serverActions: {
      // Payment screenshots and QR images are allowed up to 5 MB; the default
      // 1 MB refused them before the action's own check could say why.
      bodySizeLimit: '6mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
}

export default nextConfig
