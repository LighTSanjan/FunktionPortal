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
  graduationYear: string
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

/** The logo's four inks, in the logo's order. */
const INKS = ['var(--brand-vermilion)', 'var(--brand-marigold)', 'var(--brand-sky)', 'var(--brand-indigo)']

/** This year and the next six — the range saveWelcome accepts. */
const GRADUATION_YEARS = Array.from({ length: 7 }, (_, index) => new Date().getFullYear() + index)

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
          <section className="grid items-center gap-10 md:grid-cols-[1fr_1.1fr] md:gap-16">
            <div className="relative mx-auto w-full max-w-[330px] pb-14 pr-8 sm:max-w-[440px] sm:pb-20 sm:pr-12">
              <Photo slot={PHOTOS.crew} aspect="4 / 3" tilt={-2} swing={-6} wait={60} drift priority sizes="(min-width: 768px) 420px, 90vw" />
              <Photo
                slot={PHOTOS.candid}
                aspect="1 / 1"
                tilt={5}
                swing={11}
                wait={400}
                compact
                className="absolute bottom-0 right-0 w-[36%]"
                sizes="160px"
              />
            </div>

            <div>
              <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-text sm:text-[38px]">
                <Line wait={160}>Welcome to the </Line>
                <Line wait={240}>all new FUNKtion portal</Line>
              </h1>
              <div className="rise-in mt-5 max-w-[44ch] space-y-3 text-[15px] leading-relaxed text-text-muted" style={delay(460)}>
                <p>
                  We&rsquo;re trying this out as one place for the club&rsquo;s admin, so sign-ups and fees take less
                  chasing around.
                </p>
                <p>
                  Before you pay for the term, tell us who you are so we can get you on the roster. It takes about a
                  minute.
                </p>
                <p className="text-text">okai go do now (づ￣ ³￣)づ</p>
              </div>
              <div className="rise-in mt-8" style={delay(600)}>
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
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-text sm:text-[34px]">
              <Line wait={60}>Danced with us before?</Line>
            </h1>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 sm:gap-6">
              <PathCard
                slot={PHOTOS.newcomer}
                title="First time"
                tilt={-1}
                wait={160}
                selected={details.joiningAs === 'NEW'}
                dimmed={details.joiningAs === 'RETURNING'}
                onSelect={() => pick('NEW')}
              />
              <PathCard
                slot={PHOTOS.returning}
                title="I’ve danced with you before"
                tilt={1}
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
          <section className="mx-auto w-full max-w-lg">
            <StepCount n={2} />
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-text sm:text-[34px]">
              <Line wait={60}>{returning ? 'Welcome back' : 'About you'}</Line>
            </h1>

            <form action={act} noValidate className="mt-8">
              <input type="hidden" name="joiningAs" value={details.joiningAs ?? ''} />
              <div className="space-y-5">
                <div className="rise-in" style={delay(160)}>
                  <FormField label="Full name" htmlFor="welcome-name" error={errors.fullName} required>
                    <Input id="welcome-name" name="fullName" autoComplete="name" value={details.fullName} onChange={set('fullName')} />
                  </FormField>
                </div>
                <div className="rise-in" style={delay(220)}>
                  <FormField label="Student ID" htmlFor="welcome-id" error={errors.studentId} required>
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
                  style={delay(280)}
                  aria-describedby={errors.birthday ? 'welcome-birthday-error' : undefined}
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
                  {errors.birthday && (
                    <p id="welcome-birthday-error" className="text-[12.5px] text-danger" role="alert">{errors.birthday}</p>
                  )}
                </fieldset>
                {!returning && (
                  <div className="rise-in" style={delay(340)}>
                    <FormField label="Graduating in" htmlFor="welcome-graduation" error={errors.graduationYear} required>
                      <Select
                        id="welcome-graduation"
                        name="graduationYear"
                        value={details.graduationYear}
                        onChange={set('graduationYear')}
                        aria-invalid={errors.graduationYear ? true : undefined}
                      >
                        <option value="">Year</option>
                        {GRADUATION_YEARS.map((year) => (
                          <option key={year} value={String(year)}>
                            {year}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>
                )}
              </div>

              {state.error && !state.fieldErrors && (
                <p className="mt-4 text-[13px] text-danger" role="alert">{state.error}</p>
              )}
              {errors.joiningAs && <p className="mt-4 text-[13px] text-danger" role="alert">{errors.joiningAs}</p>}

              <div className="rise-in mt-8 flex items-center justify-between gap-3" style={delay(400)}>
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
          <section className="mx-auto w-full max-w-xl text-center">
            <Photo
              slot={PHOTOS.done}
              aspect="3 / 2"
              tilt={-2}
              swing={-8}
              wait={0}
              develop
              className="mx-auto w-full max-w-[460px]"
              sizes="(min-width: 640px) 460px, 90vw"
            />
            <h1 className="mt-10 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-text sm:text-[34px]">
              <Line wait={500}>{returning ? 'Good to have you back' : 'Nearly there'}</Line>
            </h1>
            <p className="rise-in mx-auto mt-3 max-w-[38ch] text-[14.5px] leading-relaxed text-text-muted" style={delay(680)}>
              {returning
                ? 'We’ll link you to your old record. You don’t need to wait for that to pay.'
                : 'Last bit: join for the term and pay the fee.'}
            </p>
            <div className="rise-in mt-8 flex flex-col items-center gap-3" style={delay(780)}>
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
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-4 pr-1 shadow-lg">
            <Eye className="h-4 w-4 text-text-subtle" aria-hidden />
            <span className="mr-2 text-[12.5px] font-medium text-text">
              <span className="sm:hidden">Preview</span>
              <span className="hidden sm:inline">Preview, nothing is saved</span>
            </span>
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
  return <p className="rise-in text-[12px] font-medium text-text-subtle">{n} of 2</p>
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
 * The print's wide bottom border, filled with the four inks stacked the way
 * the logo stacks them, where an instant photo's caption would go.
 */
function InkChin({ small }: { small?: boolean }) {
  return (
    <div className={cn('mt-2 flex flex-col', small ? 'h-5' : 'h-9')} aria-hidden>
      {INKS.map((ink) => (
        <span key={ink} className="flex-1" style={{ background: ink }} />
      ))}
    </div>
  )
}

/**
 * A photograph as an instant print: a white border, the club's colours in
 * the wide strip along the bottom, set down at a slight angle. Prints are white whatever the theme,
 * so the colours here are fixed rather than tokens.
 */
function Photo({
  slot,
  aspect,
  tilt,
  swing,
  wait,
  className,
  sizes,
  priority,
  drift,
  develop,
  compact,
}: {
  slot: PhotoSlot
  aspect: string
  tilt: number
  swing: number
  wait: number
  className?: string
  sizes: string
  priority?: boolean
  drift?: boolean
  develop?: boolean
  /** Too small to say what belongs in it; just the file name. */
  compact?: boolean
}) {
  return (
    <figure
      className={cn(
        'photo-place relative bg-[#FDFCF9] p-2 shadow-[0_1px_2px_rgba(20,16,10,.08),0_16px_32px_-16px_rgba(20,16,10,.4)]',
        className
      )}
      style={{ '--tilt': `${tilt}deg`, '--swing': `${swing}deg`, '--delay': `${wait}ms` } as React.CSSProperties}
    >
      <div className="relative overflow-hidden bg-[#ECE6DB]" style={{ aspectRatio: aspect }}>
        <div className={cn('absolute inset-0', drift && 'photo-drift', develop && 'develop')} style={develop ? delay(250) : undefined}>
          {slot.ready ? (
            <Image
              src={`/welcome/${slot.file}`}
              alt={slot.alt}
              fill
              sizes={sizes}
              priority={priority}
              className="object-cover"
              style={{ objectPosition: slot.focus }}
            />
          ) : (
            <EmptyFrame slot={slot} detail={!compact} />
          )}
        </div>
      </div>
      <InkChin small={compact} />
    </figure>
  )
}

/** Where a photo will go, saying which one. */
function EmptyFrame({ slot, detail }: { slot: PhotoSlot; detail: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center"
      style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 10px, rgba(20,16,10,.05) 10px 11px)' }}
    >
      <ImagePlus className="h-5 w-5 text-[#8A8175]" aria-hidden />
      <p className="break-all font-mono text-[10.5px] text-[#6E665B]">welcome/{slot.file}</p>
      {detail && <p className="max-w-[26ch] text-[11.5px] leading-snug text-[#8A8175]">{slot.want}</p>}
    </div>
  )
}

function PathCard({
  slot,
  title,
  tilt,
  wait,
  selected,
  dimmed,
  onSelect,
}: {
  slot: PhotoSlot
  title: string
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
        'photo-place group block w-full rounded-[var(--radius-md)] border bg-surface p-2 text-left',
        'transition-[opacity,border-color,box-shadow,scale] duration-300 ease-[var(--ease-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
        selected ? 'border-brand-ink shadow-md' : 'border-border hover:border-text-subtle hover:shadow-sm',
        dimmed && 'scale-[0.97] opacity-40'
      )}
      style={{ '--tilt': `${tilt}deg`, '--swing': `${tilt * 5}deg`, '--delay': `${wait}ms` } as React.CSSProperties}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[calc(var(--radius-md)-4px)] bg-[#ECE6DB]">
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
      <div className="flex items-center justify-between gap-3 px-2 pb-1.5 pt-3">
        <span className="text-[16px] font-medium text-text">{title}</span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-text-subtle transition-[translate,color] duration-300 group-hover:translate-x-1 group-hover:text-text"
          aria-hidden
        />
      </div>
    </button>
  )
}
