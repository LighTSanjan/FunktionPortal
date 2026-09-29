'use client'

import * as React from 'react'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles } from 'lucide-react'
import { saveWelcome, type WelcomeState } from '@/actions/welcome'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'
import { FormField } from '@/core/ui/form-field'
import { buttonVariants } from '@/core/ui/button-variants'
import { cn } from '@/lib/utils'

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
  clubName: string
  /** They've been through it before and are waiting to be matched. */
  done: boolean
  initial: Details
  term: { name: string; open: boolean } | null
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** The four inks, front to back — the order is the logo's and never changes. */
const INKS = ['var(--brand-vermilion)', 'var(--brand-marigold)', 'var(--brand-sky)', 'var(--brand-indigo)']

export function WelcomeFlow({ orgSlug, clubName, done, initial, term }: WelcomeFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(done ? 'done' : 'hello')
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [details, setDetails] = useState<Details>(initial)
  // Confetti is for the moment they finish, not for every visit afterwards.
  const [celebrate, setCelebrate] = useState(false)

  const go = (next: Step, dir: 'forward' | 'back' = 'forward') => {
    setDirection(dir)
    setStep(next)
  }

  const [state, act, pending] = useActionState<WelcomeState, FormData>(async (previous, formData) => {
    const result = await saveWelcome(orgSlug, previous, formData)
    if (result.ok) {
      setCelebrate(true)
      go('done')
      // The sidebar and the fees page read where they stand; bring them along.
      router.refresh()
    }
    return result
  }, { error: null })

  const set = (field: keyof Details) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDetails((current) => ({ ...current, [field]: event.target.value }))

  const pick = (joiningAs: JoiningAs) => {
    setDetails((current) => ({ ...current, joiningAs }))
    // A beat to see the card take the choice before the screen moves on.
    window.setTimeout(() => go('details'), 260)
  }

  const errors = state.fieldErrors ?? {}
  const returning = details.joiningAs === 'RETURNING'

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-xl flex-col justify-center py-6">
      <Progress step={step} />

      <div
        key={step}
        className={cn(
          'relative mt-5 rounded-[var(--radius-lg)] border-2 border-brand-ink bg-paper p-6 lapis-plate sm:p-8',
          direction === 'forward' ? 'wizard-enter-from-right' : 'wizard-enter-from-left'
        )}
      >
        {step === 'hello' && (
          <div className="text-center">
            <LapisCake />
            <h1 className="rise-in mt-8 text-[28px] font-extrabold leading-tight tracking-tight text-text sm:text-[32px]" style={{ '--delay': '520ms' } as React.CSSProperties}>
              Welcome to {clubName}
            </h1>
            <p className="rise-in mt-2 text-[14px] font-semibold text-accent-500" style={{ '--delay': '600ms' } as React.CSSProperties}>
              FUNKtion - SUTD&rsquo;s Ultimate Popping &amp; Locking Dance Club!
            </p>
            <p className="rise-in mx-auto mt-4 max-w-sm text-[14px] leading-relaxed text-text-muted" style={{ '--delay': '680ms' } as React.CSSProperties}>
              Two quick questions and you&rsquo;re on the floor. It takes about a minute.
            </p>
            <div className="rise-in mt-7" style={{ '--delay': '760ms' } as React.CSSProperties}>
              <Button type="button" size="lg" onClick={() => go('who')}>
                Let&rsquo;s go <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}

        {step === 'who' && (
          <div>
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-text">
              Have you danced with us before?
            </h1>
            <p className="mt-1.5 text-[14px] text-text-muted">This decides how we set you up. Nothing is final.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Choice
                selected={details.joiningAs === 'NEW'}
                onSelect={() => pick('NEW')}
                icon={<Sparkles className="h-5 w-5" aria-hidden />}
                ink={INKS[0]}
                title="I’m new here"
                detail="First time joining FUNKtion. Welcome to the crew!"
                delay={80}
              />
              <Choice
                selected={details.joiningAs === 'RETURNING'}
                onSelect={() => pick('RETURNING')}
                icon={<RotateCcw className="h-5 w-5" aria-hidden />}
                ink={INKS[2]}
                title="I’ve been a member"
                detail="You were on the roster before — last term, or a while back."
                delay={160}
              />
            </div>
            <div className="mt-6">
              <Button type="button" variant="ghost" onClick={() => go('hello', 'back')}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </Button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <form action={act} noValidate>
            <input type="hidden" name="joiningAs" value={details.joiningAs ?? ''} />
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-text">
              {returning ? 'Welcome back! Who are you?' : 'Tell us who you are'}
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">
              {returning
                ? 'The exco check this against the roster, then link your account to your record.'
                : 'This goes on the club roster once the exco add you.'}
            </p>

            <div className="mt-6 space-y-4">
              <div className="rise-in" style={{ '--delay': '40ms' } as React.CSSProperties}>
                <FormField label="Full name" htmlFor="welcome-name" hint="As on your student card." error={errors.fullName} required>
                  <Input id="welcome-name" name="fullName" autoComplete="name" value={details.fullName} onChange={set('fullName')} />
                </FormField>
              </div>
              <div className="rise-in" style={{ '--delay': '100ms' } as React.CSSProperties}>
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
              <fieldset className="rise-in space-y-1.5" style={{ '--delay': '160ms' } as React.CSSProperties} aria-describedby={errors.birthday ? 'welcome-birthday-error' : 'welcome-birthday-hint'}>
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
                    So the crew can wish you a happy birthday. The year is optional.
                  </p>
                )}
              </fieldset>
            </div>

            {state.error && !state.fieldErrors && (
              <p className="mt-4 text-[13px] text-danger" role="alert">{state.error}</p>
            )}
            {errors.joiningAs && <p className="mt-4 text-[13px] text-danger" role="alert">{errors.joiningAs}</p>}

            <div className="mt-7 flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => go('who', 'back')}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </Button>
              <Button type="submit" size="lg" loading={pending}>
                Continue <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="relative text-center">
            {celebrate && <Confetti />}
            <div className="lapis-drop mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand-ink bg-accent-500 text-white lapis-plate-sm">
              <Check className="h-8 w-8" strokeWidth={3} aria-hidden />
            </div>
            <h1 className="rise-in mt-6 text-[26px] font-extrabold leading-tight tracking-tight text-text" style={{ '--delay': '160ms' } as React.CSSProperties}>
              {returning ? 'Welcome back!' : 'You’re almost in!'}
            </h1>
            <p className="rise-in mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-text-muted" style={{ '--delay': '240ms' } as React.CSSProperties}>
              {returning
                ? 'The exco will link your account to your roster record. You don’t need to wait for that to pay.'
                : 'Last step: join for the term and pay your fee. The exco add you to the roster once they’ve checked it.'}
            </p>
            <div className="rise-in mt-7 flex flex-col items-center gap-3" style={{ '--delay': '320ms' } as React.CSSProperties}>
              {term ? (
                <>
                  <Link href={`/${orgSlug}/fees`} className={buttonVariants({ size: 'lg' })}>
                    {term.open ? `Join and pay for ${term.name}` : `See the ${term.name} form`}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  {!term.open && (
                    <p className="text-[12.5px] text-text-subtle">
                      It isn&rsquo;t open yet. The exco post in the Telegram group when it is.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-text-muted">There&rsquo;s no term to join right now. Check back soon.</p>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => go('details', 'back')}>
                Change my details
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Three steps after the hello, one segment each, filled in the logo's inks. */
function Progress({ step }: { step: Step }) {
  const reached = { hello: 0, who: 1, details: 2, done: 3 }[step]
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${Math.max(reached, 1)} of 3`} role="img">
      {[1, 2, 3].map((segment) => (
        <div key={segment} className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-line">
          <div
            className="h-full rounded-full transition-[width] duration-[var(--dur-3)] ease-[var(--ease-soft)]"
            style={{ width: reached >= segment ? '100%' : '0%', background: INKS[segment - 1] }}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * The kueh lapis, building itself: four layers dropping in from above, each
 * a step down and to the right of the last, the way the logo stacks.
 */
function LapisCake() {
  return (
    <div className="groove mx-auto w-fit" style={{ '--delay': '1000ms' } as React.CSSProperties} aria-hidden>
      <div className="relative h-[124px] w-[216px]">
        {[3, 2, 1, 0].map((layer) => (
          <div
            key={layer}
            className="lapis-drop absolute h-[26px] w-[180px] rounded-[8px] border-2 border-brand-ink"
            style={
              {
                // The step to the right is position, not transform: the drop
                // animation owns transform and lets go of it once it lands.
                left: layer * 9,
                top: layer * 28 + 6,
                background: INKS[layer],
                '--delay': `${(3 - layer) * 110}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}

function Choice({
  selected,
  onSelect,
  icon,
  ink,
  title,
  detail,
  delay,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  ink: string
  title: string
  detail: string
  delay: number
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rise-in lapis-lift group flex flex-col items-start gap-3 rounded-[var(--radius-md)] border-2 bg-surface p-5 text-left',
        selected ? 'module-card-pop border-brand-ink' : 'border-border hover:border-brand-ink'
      )}
      style={{ '--delay': `${delay}ms` } as React.CSSProperties}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-brand-ink text-brand-ink"
        style={{ background: ink }}
      >
        {icon}
      </span>
      <span>
        <span className="block text-[16px] font-bold text-text">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-text-muted">{detail}</span>
      </span>
    </button>
  )
}

/** Deterministic, so the same pieces fly the same way every time. */
const PIECES = Array.from({ length: 22 }, (_, index) => {
  const angle = (index / 22) * Math.PI * 2 + (index % 3) * 0.3
  const reach = 110 + ((index * 37) % 70)
  return {
    dx: Math.round(Math.cos(angle) * reach),
    dy: Math.round(Math.sin(angle) * reach * 0.8 - 40),
    spin: ((index * 83) % 540) - 270,
    ink: INKS[index % 4],
    delay: (index % 5) * 30,
    round: index % 3 === 0,
  }
})

function Confetti() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-8 h-0 w-0" aria-hidden>
      {PIECES.map((piece, index) => (
        <span
          key={index}
          className={cn('confetti-piece absolute h-2.5 w-2.5 border border-brand-ink', piece.round ? 'rounded-full' : 'rounded-[2px]')}
          style={
            {
              background: piece.ink,
              '--dx': `${piece.dx}px`,
              '--dy': `${piece.dy}px`,
              '--spin': `${piece.spin}deg`,
              '--delay': `${piece.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
