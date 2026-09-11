import Image from 'next/image'
import { Wordmark } from '@/core/ui/logo'

export function Hero({
  greetingName,
  orgName,
  roleLabel,
  termName,
  financialYear,
  today,
}: {
  greetingName: string
  orgName: string
  roleLabel: string
  termName: string | null
  financialYear: number
  today: Date
}) {
  // Singapore time, not the server's. A treasurer in Changi being told "good
  // evening" over breakfast because the box is in Virginia is a small thing
  // that makes the whole page feel like it was written for somebody else.
  const hour = Number(
    today.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', hour12: false })
  )
  const partOfDay = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'

  return (
    <section className="fade-in relative overflow-hidden rounded-[var(--radius-lg)] border border-brand-ink bg-surface">
      <div aria-hidden="true" className="lapis-band h-[6px]" />

      <div className="relative grid sm:grid-cols-[1.15fr_1fr] lg:grid-cols-[1.35fr_1fr]">
        {/* Shorter than it was. The greeting is orientation, not work, and at
            its old height it pushed both jobs below the fold on a laptop —
            which is the whole of what somebody signs in to do. */}
        <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
            {orgName} · {roleLabel}
          </p>
          <h1 className="mt-1.5 text-[22px] font-semibold leading-[1.1] tracking-[-0.03em] text-text sm:text-[26px]">
            {partOfDay}, {greetingName}.
          </h1>
          <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-text-muted">
            {termName ? (
              <>
                <span className="font-medium text-text">{termName}</span> is running.{' '}
              </>
            ) : null}
            Financial year {financialYear}/{financialYear + 1}. Today is{' '}
            {today.toLocaleDateString('en-SG', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            .
          </p>
        </div>

        {/* The club itself. Hidden below sm, where it would push the greeting
            off the top of a phone for no information. */}
        <div className="relative hidden min-h-[130px] sm:block">
          <Image
            src="/eu-gene-battle.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 640px) 45vw, 0px"
            className="object-cover object-[50%_30%]"
          />
          {/* Fades the photograph into the card rather than butting it against
              the text — a hard vertical seam here reads as two components that
              happen to be adjacent. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 55%, transparent) 34%, transparent 68%),' +
                'linear-gradient(200deg, rgba(10,11,20,.34) 0%, transparent 62%)',
            }}
          />
          <Wordmark
            aria-hidden="true"
            className="absolute bottom-3 right-4 h-[38px] drop-shadow-[0_2px_10px_rgba(0,0,0,.35)] lg:h-[46px]"
          />
        </div>
      </div>
    </section>
  )
}
