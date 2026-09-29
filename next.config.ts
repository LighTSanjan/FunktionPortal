import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/adapter-pg', 'pg', 'playwright-core', '@sparticuz/chromium'],
  // The email-assets route reads these from disk; its readFile is excluded
  // from tracing so the whole project is not bundled, so name them here.
  outputFileTracingIncludes: {
    '/api/email-assets/*': ['./docs/assets/funktion-logo.png', './public/eu-gene-battle.jpg'],
  },
  experimental: {
    serverActions: {
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
