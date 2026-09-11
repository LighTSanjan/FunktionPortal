import { Wordmark } from '@/core/ui/logo'
import { StagePhoto } from './_components/stage-photo'
import { BRAND } from '@/core/brand'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={
        {
          '--bg': '#FFFFFF',
          '--bg-subtle': '#FBF8F3',
          '--surface': '#FFFFFF',
          '--surface-hover': '#F5F1E9',
          '--border': '#E8E0D2',
          '--border-strong': '#D3CABA',
          '--text': '#17192B',
          '--text-muted': '#5A5F72',
          '--text-subtle': '#8A8E9E',
          '--paper': '#FBF8F3',
          '--paper-deep': '#F4EFE6',
          '--paper-line': '#E8E0D2',
          '--brand-ink': '#111114',
          colorScheme: 'light',
          background: '#FBF8F3',
          color: '#17192B',
        } as React.CSSProperties
      }
    >
      <div aria-hidden="true" className="lapis-band h-[7px] shrink-0" />

      <div className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        <aside className="relative h-[190px] overflow-hidden sm:h-[240px] lg:h-auto">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(330deg, #F05B23 0%, #FBAE3A 34%, #5BC5EF 68%, #344D90 100%)',
            }}
          />

          <StagePhoto />

          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgba(10,11,20,.86) 0%, rgba(10,11,20,.46) 34%, rgba(10,11,20,.06) 62%),' +
                'radial-gradient(110% 80% at 0% 0%, rgba(10,11,20,.62) 0%, rgba(10,11,20,.18) 45%, transparent 74%)',
            }}
          />

          <Wordmark
            priority
            className="fade-in absolute left-6 top-5 h-12 lg:left-10 lg:top-9 lg:h-20 xl:left-14 xl:top-11"
          />

          <div className="rise-in absolute inset-x-0 bottom-0 p-6 lg:p-10 xl:p-14" style={{ '--delay': '90ms' } as React.CSSProperties}>
            <h2 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.025em] text-white lg:text-[42px] xl:text-[52px]">
              {BRAND.name} Portal
            </h2>
            <p className="mt-2 text-[13.5px] text-white/80 lg:mt-3 lg:text-[16px] xl:text-[17px]">
              {BRAND.tagline}
            </p>
          </div>

          <div
            aria-hidden="true"
            className="lapis-band absolute inset-y-0 right-0 hidden w-[5px] lg:block"
            style={{
              background:
                'linear-gradient(to bottom, var(--brand-vermilion) 0 25%, var(--brand-marigold) 25% 50%, var(--brand-sky) 50% 75%, var(--brand-indigo) 75% 100%)',
            }}
          />
        </aside>

        <main className="relative flex items-center justify-center overflow-hidden bg-paper px-5 py-10 sm:px-10 sm:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 h-[420px] w-[420px] rotate-[-24deg] opacity-[0.14]"
            style={{
              background:
                'repeating-linear-gradient(180deg,' +
                'var(--brand-vermilion) 0 14px, transparent 14px 34px,' +
                'var(--brand-marigold) 34px 48px, transparent 48px 68px,' +
                'var(--brand-sky) 68px 82px, transparent 82px 102px,' +
                'var(--brand-indigo) 102px 116px, transparent 116px 136px)',
            }}
          />

          <div className="rise-in relative w-full max-w-[420px]" style={{ '--delay': '60ms' } as React.CSSProperties}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
