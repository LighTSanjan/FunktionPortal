'use client'

import * as React from 'react'
import { useActionState, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Eye, ImagePlus, PartyPopper, RotateCcw } from 'lucide-react'
import { saveWelcome, type WelcomeState } from '@/actions/welcome'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'
import { FormField } from '@/core/ui/form-field'
import { buttonVariants } from '@/core/ui/button-variants'
import { cn } from '@/lib/utils'
import { PHOTOS, type PhotoSlot } from './photos'
import { hand } from './fonts'
import { Confetti } from './confetti'

type JoiningAs = 'NEW' | 'RETURNING'
type Step = 'hello' | 'who' | 'details' | 'done'

interface Details {
  joiningAs: JoiningAs | null
  fullName: string
  studentId: string
  birthDay: string
  birthMonth: string
  birthYear: string
}

export interface WelcomeFlowProps {
  orgSlug: string
  /** They've been through it before and are waiting to be matched. */
  done: boolean
  initial: Details
  term: { name: string; open: boolean } | null
  /** Somebody already on the roster walking through it: nothing is saved. */
  preview?: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const delay = (ms: number) => ({ '--delay': `${ms}ms` }) as React.CSSProperties

export function WelcomeFlow({ orgSlug, done, initial, term, preview = false }: WelcomeFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(done ? 'done' : 'hello')
  const [details, setDetails] = useState<Details>(initial)
  // Bumped to fire the confetti: when somebody finishes, not on every visit.
  const [shot, setShot] = useState(0)
  const top = useRef<HTMLDivElement>(null)

  const go = (next: Step) => setStep(next)

  // The page scrolls inside the shell's <main>, not the window. On a phone
  // the next step's heading is otherwise somewhere above you.
  useEffect(() => {
    top.current?.closest('main')?.scrollTo({ top: 0 })
  }, [step])

  const [state, act, pending] = useActionState<WelcomeState, FormData>(async (previous, formData) => {
    const result = preview
      ? await new Promise<WelcomeState>((resolve) => window.setTimeout(() => resolve({ error: null, ok: true }), 450))
      : await saveWelcome(orgSlug, previous, formData)
    if (result.ok) {
      go('done')
      setShot((n) => n + 1)
      // The sidebar and the fees page read where they stand; bring them along.
      if (!preview) router.refresh()
    }
    return result
  }, { error: null })

  const set = (field: keyof Details) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDetails((current) => ({ ...current, [field]: event.target.value }))

  const pick = (joiningAs: JoiningAs) => {
    setDetails((current) => ({ ...current, joiningAs }))
    // Long enough to see the other card step back before the screen moves on.
    window.setTimeout(() => go('details'), 380)
  }

  const errors = state.fieldErrors ?? {}
  const returning = details.joiningAs === 'RETURNING'
  const firstName = details.fullName.trim().split(/\s+/)[0] ?? ''

  return (
    <>
      <Confetti shot={shot} />
      <div
        ref={top}
        key={step}
        className={cn(
          'mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-5xl flex-col justify-center py-6 sm:py-10',
          // Room to scroll the last button clear of the preview bar.
          preview && 'pb-24 sm:pb-24'
        )}
      >
        {step === 'hello' && (
          <section className="grid items-center gap-8 md:grid-cols-[1fr_1.05fr] md:gap-16">
            <div className="relative mx-auto w-full max-w-[250px] pb-14 pr-10 sm:max-w-[360px] sm:pb-20 sm:pr-16">
              <Polaroid slot={PHOTOS.crew} aspect="4 / 5" tilt={-2.5} swing={-7} wait={60} tape drift priority sizes="(min-width: 768px) 320px, 75vw" />
              <Polaroid
                slot={PHOTOS.candid}
                aspect="1 / 1"
                tilt={6}
                swing={12}
                wait={420}
                compact
                className="absolute bottom-0 right-0 w-[48%]"
                sizes="170px"
              />
            </div>

            <div>
              <p className="rise-in text-[12.5px] font-semibold text-accent-500" style={delay(120)}>
                FUNKtion - SUTD&rsquo;s Ultimate Popping &amp; Locking Dance Club!
              </p>
              <h1 className="mt-3 text-[44px] font-extrabold leading-[0.98] tracking-[-0.04em] text-text sm:text-[56px]">
                <Line wait={220}>Hey, you </Line>
                <Line wait={320}>found us.</Line>
              </h1>
              <p className="rise-in mt-5 max-w-[40ch] text-[15px] leading-relaxed text-text-muted" style={delay(560)}>
                Before you pay for the term, tell us who you are so we can get you on the roster. It takes about a
                minute.
              </p>
              <p className={cn(hand.className, 'rise-in mt-2 text-[24px] leading-none text-text')} style={delay(680)}>
                &mdash; the exco
              </p>
              <div className="rise-in mt-8" style={delay(780)}>
                <Button type="button" size="lg" onClick={() => go('who')}>
                  Start <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === 'who' && (
          <section className="mx-auto w-full max-w-3xl">
            <StepCount n={1} />
            <h1 className="mt-2 text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] text-text sm:text-[42px]">
              <Line wait={60}>Danced with us before?</Line>
            </h1>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 sm:gap-7">
              <PathCard
                slot={PHOTOS.newcomer}
                title="First time"
                detail="New to FUNKtion. Welcome in."
                tilt={-1.2}
                wait={160}
                selected={details.joiningAs === 'NEW'}
                dimmed={details.joiningAs === 'RETURNING'}
                onSelect={() => pick('NEW')}
              />
              <PathCard
                slot={PHOTOS.returning}
                title="I’ve danced with you before"
                detail="You were on the roster in an earlier term."
                tilt={1.2}
                wait={260}
                selected={details.joiningAs === 'RETURNING'}
                dimmed={details.joiningAs === 'NEW'}
                onSelect={() => pick('RETURNING')}
              />
            </div>
            <div className="mt-8">
              <Button type="button" variant="ghost" onClick={() => go('hello')}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </Button>
            </div>
          </section>
        )}

        {step === 'details' && (
          <section className="mx-auto w-full max-w-xl">
            <StepCount n={2} />
            <div className="mt-2 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-[32px] font-extrabold leading-[1.02] tracking-[-0.035em] text-text sm:text-[38px]">
                  {returning ? (
                    <>
                      <Line wait={60}>Welcome back. </Line>
                      <Line wait={140}>Remind us who you are.</Line>
                    </>
                  ) : (
                    <Line wait={60}>Who are you?</Line>
                  )}
                </h1>
                <p className="rise-in mt-3 text-[14px] leading-relaxed text-text-muted" style={delay(260)}>
                  {returning ? 'We’ll find your old record and link you to it.' : 'This is what goes on the club roster.'}
                </p>
              </div>
              <Polaroid
                slot={returning ? PHOTOS.returning : PHOTOS.newcomer}
                aspect="1 / 1"
                tilt={5}
                swing={10}
                wait={120}
                thumb
                className="w-[76px] shrink-0 sm:w-[92px]"
                sizes="92px"
              />
            </div>

            <form action={act} noValidate className="mt-8">
              <input type="hidden" name="joiningAs" value={details.joiningAs ?? ''} />
              <div className="space-y-5">
                <div className="rise-in" style={delay(320)}>
                  <FormField label="Full name" htmlFor="welcome-name" hint="As on your student card." error={errors.fullName} required>
                    <Input id="welcome-name" name="fullName" autoComplete="name" value={details.fullName} onChange={set('fullName')} />
                  </FormField>
                </div>
                <div className="rise-in" style={delay(390)}>
                  <FormField label="Student ID" htmlFor="welcome-id" hint="The seven digits on your student card." error={errors.studentId} required>
                    <Input
                      id="welcome-id"
                      name="studentId"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={40}
                      value={details.studentId}
                      onChange={set('studentId')}
                      className="tabular-nums"
                    />
                  </FormField>
                </div>
                <fieldset
                  className="rise-in space-y-1.5"
                  style={delay(460)}
                  aria-describedby={errors.birthday ? 'welcome-birthday-error' : 'welcome-birthday-hint'}
                >
                  <legend className="text-[13px] font-medium text-text">
                    Birthday<span className="ml-0.5 text-danger" aria-hidden="true">*</span>
                  </legend>
                  <div className="grid grid-cols-[5rem_1fr_6rem] gap-2">
                    <Input
                      aria-label="Day"
                      name="birthDay"
                      inputMode="numeric"
                      placeholder="Day"
                      maxLength={2}
                      value={details.birthDay}
                      onChange={set('birthDay')}
                      aria-invalid={errors.birthday ? true : undefined}
                    />
                    <Select aria-label="Month" name="birthMonth" value={details.birthMonth} onChange={set('birthMonth')} aria-invalid={errors.birthday ? true : undefined}>
                      <option value="">Month</option>
                      {MONTHS.map((month, index) => (
                        <option key={month} value={String(index + 1)}>
                          {month}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label="Year (optional)"
                      name="birthYear"
                      inputMode="numeric"
                      placeholder="Year"
                      maxLength={4}
                      value={details.birthYear}
                      onChange={set('birthYear')}
                    />
                  </div>
                  {errors.birthday ? (
                    <p id="welcome-birthday-error" className="text-[12.5px] text-danger" role="alert">{errors.birthday}</p>
                  ) : (
                    <p id="welcome-birthday-hint" className="text-[12px] text-text-subtle">
                      So we can make a fuss on the day. The year is up to you.
                    </p>
                  )}
                </fieldset>
              </div>

              {state.error && !state.fieldErrors && (
                <p className="mt-4 text-[13px] text-danger" role="alert">{state.error}</p>
              )}
              {errors.joiningAs && <p className="mt-4 text-[13px] text-danger" role="alert">{errors.joiningAs}</p>}

              <div className="rise-in mt-8 flex items-center justify-between gap-3" style={delay(520)}>
                <Button type="button" variant="ghost" onClick={() => go('who')}>
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                </Button>
                <Button type="submit" size="lg" loading={pending}>
                  Continue <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </form>
          </section>
        )}

        {step === 'done' && (
          <section className="mx-auto w-full max-w-md text-center">
            <Polaroid
              slot={PHOTOS.done}
              aspect="1 / 1"
              tilt={-3}
              swing={-10}
              wait={0}
              tape
              develop
              centred
              caption={firstName ? `${firstName}, ${returning ? 'back again' : 'day one'}` : returning ? 'back again' : 'day one'}
              className="mx-auto w-[230px]"
              sizes="230px"
            />
            <h1 className="mt-10 text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] text-text sm:text-[40px]">
              {returning ? (
                <>
                  <Line wait={500}>Good to have </Line>
                  <Line wait={580}>you back.</Line>
                </>
              ) : (
                <Line wait={500}>Nearly there.</Line>
              )}
            </h1>
            <p className="rise-in mx-auto mt-4 max-w-[38ch] text-[14.5px] leading-relaxed text-text-muted" style={delay(720)}>
              {returning
                ? 'We’ll link you to your old record. You don’t need to wait for that to pay.'
                : 'Last bit: join for the term and pay the fee. We’ll put you on the roster once we’ve checked it.'}
            </p>
            <div className="rise-in mt-8 flex flex-col items-center gap-3" style={delay(820)}>
              {term ? (
                <>
                  <Link href={`/${orgSlug}/fees`} className={buttonVariants({ size: 'lg' })}>
                    {term.open ? `Join and pay for ${term.name}` : `See the ${term.name} form`}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  {!term.open && (
                    <p className="text-[12.5px] text-text-subtle">
                      It isn&rsquo;t open yet. We&rsquo;ll post in the Telegram group when it is.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-text-muted">There&rsquo;s no term to join right now. Check back soon.</p>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => go('details')}>
                Change my details
              </Button>
            </div>
          </section>
        )}
      </div>

      {preview && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-1 rounded-full border border-brand-ink bg-surface py-1 pl-4 pr-1 shadow-lg">
            <Eye className="h-4 w-4 text-text-subtle" aria-hidden />
            <span className="mr-2 text-[12.5px] font-medium text-text"><span className="sm:hidden">Preview</span><span className="hidden sm:inline">Preview, nothing is saved</span></span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShot((n) => n + 1)}>
              <PartyPopper className="h-4 w-4" aria-hidden /> Confetti
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDetails(initial)
                go('hello')
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Restart
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function StepCount({ n }: { n: 1 | 2 }) {
  return (
    <p className="rise-in text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
      {n} of 2
    </p>
  )
}

/** One line of a headline, rising from behind its own baseline. */
function Line({ wait, children }: { wait: number; children: React.ReactNode }) {
  return (
    <span className="line-reveal">
      <span style={delay(wait)}>{children}</span>
    </span>
  )
}

/**
 * A photograph as an instant print: white border, deeper at the bottom for
 * the caption, set down on the page at a slight angle. Polaroids are white
 * whatever the theme, so the colours here are fixed rather than tokens.
 */
function Polaroid({
  slot,
  aspect,
  tilt,
  swing,
  wait,
  caption = slot.caption,
  className,
  sizes,
  priority,
  tape,
  drift,
  develop,
  compact,
  thumb,
  centred,
}: {
  slot: PhotoSlot
  aspect: string
  tilt: number
  swing: number
  wait: number
  caption?: string
  className?: string
  sizes: string
  priority?: boolean
  tape?: boolean
  drift?: boolean
  develop?: boolean
  /** Too small to say what belongs in it; just the file name. */
  compact?: boolean
  /** A stamp-sized print: no caption, nothing written in the empty frame. */
  thumb?: boolean
  centred?: boolean
}) {
  return (
    <figure
      className={cn(
        'photo-place relative bg-[#FDFCF9] shadow-[0_1px_2px_rgba(20,16,10,.10),0_18px_36px_-16px_rgba(20,16,10,.45)]',
        thumb ? 'p-1.5 pb-4' : 'p-2.5 pb-0',
        className
      )}
      style={{ '--tilt': `${tilt}deg`, '--swing': `${swing}deg`, '--delay': `${wait}ms` } as React.CSSProperties}
    >
      {tape && (
        <span
          aria-hidden
          className="absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 -rotate-3 bg-[#FBAE3A]/55 mix-blend-multiply"
        />
      )}
      <div className="relative overflow-hidden bg-[#ECE6DB]" style={{ aspectRatio: aspect }}>
        <div className={cn('absolute inset-0', drift && 'photo-drift', develop && 'develop')} style={develop ? delay(250) : undefined}>
          {slot.ready ? (
            <Image
              src={`/welcome/${slot.file}`}
              alt={thumb ? '' : slot.alt}
              fill
              sizes={sizes}
              priority={priority}
              className="object-cover"
              style={{ objectPosition: slot.focus }}
            />
          ) : (
            <EmptyFrame slot={slot} detail={!compact && !thumb} bare={thumb} />
          )}
        </div>
      </div>
      {!thumb && (
        <figcaption className={cn(hand.className, 'flex h-11 items-center px-3 text-[22px] leading-none text-[#2A2622]', centred ? 'justify-center' : 'justify-start')}>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

/** Where a photo will go, saying which one. */
function EmptyFrame({ slot, detail, bare }: { slot: PhotoSlot; detail: boolean; bare?: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center"
      style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 10px, rgba(20,16,10,.05) 10px 11px)' }}
    >
      <ImagePlus className="h-5 w-5 text-[#8A8175]" aria-hidden />
      {!bare && <p className="break-all font-mono text-[10.5px] text-[#6E665B]">welcome/{slot.file}</p>}
      {detail && <p className="max-w-[26ch] text-[11.5px] leading-snug text-[#8A8175]">{slot.want}</p>}
    </div>
  )
}

function PathCard({
  slot,
  title,
  detail,
  tilt,
  wait,
  selected,
  dimmed,
  onSelect,
}: {
  slot: PhotoSlot
  title: string
  detail: string
  tilt: number
  wait: number
  selected: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'photo-place group block w-full rounded-[var(--radius-md)] border-2 bg-surface p-2 text-left',
        'transition-[opacity,border-color,box-shadow,scale] duration-300 ease-[var(--ease-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
        selected ? 'border-brand-ink lapis-plate-sm' : 'border-border hover:border-brand-ink',
        dimmed && 'scale-[0.97] opacity-40'
      )}
      style={{ '--tilt': `${tilt}deg`, '--swing': `${tilt * 5}deg`, '--delay': `${wait}ms` } as React.CSSProperties}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[calc(var(--radius-md)-4px)] bg-[#ECE6DB]">
        <div className="absolute inset-0 transition-transform duration-700 ease-[var(--ease-soft)] group-hover:scale-[1.05]">
          {slot.ready ? (
            <Image
              src={`/welcome/${slot.file}`}
              alt=""
              fill
              sizes="(min-width: 640px) 360px, 90vw"
              className="object-cover"
              style={{ objectPosition: slot.focus }}
            />
          ) : (
            <EmptyFrame slot={slot} detail />
          )}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 px-2 pb-2 pt-3.5">
        <span>
          <span className="block text-[18px] font-bold tracking-[-0.01em] text-text">{title}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-text-muted">{detail}</span>
        </span>
        <ArrowRight
          className="mb-1 h-5 w-5 shrink-0 text-text-subtle transition-[translate,color] duration-300 group-hover:translate-x-1 group-hover:text-text"
          aria-hidden
        />
      </div>
    </button>
  )
}
