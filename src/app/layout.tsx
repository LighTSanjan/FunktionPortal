import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { BRAND } from '@/core/brand'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: BRAND.productName,
    template: `%s | ${BRAND.productName}`,
  },
  description: BRAND.description,
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        {/*
          Theme before first paint.

          The portal defaults to light. It is a dance club's noticeboard, and
          the palette it is drawn in — warm paper, four bright inks — is a
          light one; served to a laptop set to dark it came out as a black
          page with an orange button on it. Dark is still there for anyone who
          picks it from the profile menu, it is just no longer inherited from
          the operating system by default.

          `light` is on <html> already, so the default needs no JavaScript at
          all. This script only handles the override, and has to be inline and
          synchronous because it must run before the browser paints — a dark
          reader would otherwise see a white flash on every navigation.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('funktion-theme')==='dark'){" +
              "var r=document.documentElement;r.classList.remove('light');" +
              "r.classList.add('dark')}}catch(e){}",
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
