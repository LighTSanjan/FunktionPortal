'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FeeTier } from '@prisma/client'
import { submitMembershipForm, type FormActionState } from '@/modules/membership-form/actions'
import { fieldName, type Answer, type Question } from '@/modules/membership-form/questions'
import { TIER_LABEL } from '@/modules/fees/tiers'
import { formatSgd } from '@/modules/coach-claim/money'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'
import { Textarea } from '@/core/ui/textarea'
import { Label } from '@/core/ui/label'
import { cn } from '@/lib/utils'
import { Notice, pillClass } from './ui'

export interface MembershipFormProps {
  orgSlug: string
  termId: string
  termName: string
  questions: Question[]
  /** Who they are, from the roster, when their account is linked to it. */
  rosterName: { fullName: string; studentId: string | null } | null
  /** Their student ID, read off a student-ID email address. Not editable. */
  lockedStudentId: string | null
  /** The fees they may pick from, with their prices. Empty when not theirs to pick. */
  choices: { tier: FeeTier; amountCents: number }[]
  /** What they pay when they do not pick: a fee the exco set, or the roster's. */
  fixedFee: { amountCents: number; label: string; note: string | null } | null
  /** Where a payment already stands. Only NONE and REJECTED ask for one. */
  payment: 'NONE' | 'REJECTED' | 'DECLARED' | 'CONFIRMED' | 'HELD'
  hasQr: boolean
  /** Their last response, when they are editing it. */
  previous: {
    fullName: string
    studentId: string | null
    birthDay: number | null
    birthMonth: number | null
    birthYear: number | null
    tier: FeeTier | null
    answers: Answer[]
  } | null
  defaultTier: FeeTier | null
  /** An exco member looking at it: everything shows, nothing sends. */
  preview: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The membership form.
 *
 * Four short sections on one page — you, your membership, the club's
 * questions, paying — with one button at the end. One page rather than steps,
 * because on a phone a long page scrolls and a wizard loses what you typed the
 * moment the connection drops.
 */
export function MembershipForm(props: MembershipFormProps) {
  const { orgSlug, termId, questions, rosterName, lockedStudentId, choices, fixedFee, payment, previous, preview } = props
  const router = useRouter()
  const [tier, setTier] = useState<FeeTier | null>(props.defaultTier)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [state, act, pending] = useActionState<FormActionState, FormData>(
    submitMembershipForm.bind(null, orgSlug),
    { error: null }
  )

  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) router.replace(`/${orgSlug}/fees?term=${termId}&sent=1`)
  }, [state.ok, router, orgSlug, termId])

  // The button is at the bottom of a long page on a phone. Take them to the
  // first thing to fix rather than leaving the message out of sight above.
  useEffect(() => {
    if (!state.error) return
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], p[role="alert"]')
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (first instanceof HTMLInputElement || first instanceof HTMLSelectElement) first.focus({ preventScroll: true })
  }, [state])

  const errors = state.fieldErrors ?? {}
  const amountCents = fixedFee ? fixedFee.amountCents : (choices.find((c) => c.tier === tier)?.amountCents ?? 0)
  const asksForPayment = amountCents > 0 && (payment === 'NONE' || payment === 'REJECTED')
  const amount = formatSgd(amountCents)
  let section = 0

  return (
    <form
      ref={formRef}
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        // Not `action={act}`: React clears a form once its action finishes, and
        // somebody told to fix their birthday should not have to type
        // everything else again.
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => act(data))
      }}
    >
      <input type="hidden" name="termId" value={termId} />

      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}

      <Section n={++section} title="About you">
        {rosterName ? (
          <p className="text-[14px] leading-relaxed text-text">
            You&rsquo;re on the club roster as <span className="font-semibold">{rosterName.fullName}</span>
            {rosterName.studentId && (
              <span className="text-text-muted">
                {' '}
                · <span className="tabular-nums">{rosterName.studentId}</span>
              </span>
            )}
            .
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-text-muted">
              New to FUNKtion, or signed in with a different email from last time? Tell us who you are and the exco
              will put you on the roster.
            </p>
            <Field label="Full name" htmlFor="fullName" error={errors.fullName} hint="As on your student card.">
              <Input
                id="fullName"
                name="fullName"
                autoComplete="name"
                maxLength={120}
                defaultValue={previous?.fullName ?? ''}
                aria-invalid={errors.fullName ? true : undefined}
              />
            </Field>
            <Field
              label="Student ID"
              htmlFor="studentId"
              error={errors.studentId}
              hint={lockedStudentId ? 'From the email you signed in with.' : 'The seven digits on your student card.'}
            >
              <Input
                id="studentId"
                name="studentId"
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                readOnly={Boolean(lockedStudentId)}
                defaultValue={lockedStudentId ?? previous?.studentId ?? ''}
                placeholder="1001234"
                className="tabular-nums"
                aria-invalid={errors.studentId ? true : undefined}
              />
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-[13px] font-medium text-text">Birthday</legend>
              <div className="grid grid-cols-[5rem_1fr_6rem] gap-2">
                <Select
                  name="birthDay"
                  aria-label="Day"
                  defaultValue={previous?.birthDay ? String(previous.birthDay) : ''}
                  aria-invalid={errors.birthday ? true : undefined}
                >
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </Select>
                <Select
                  name="birthMonth"
                  aria-label="Month"
                  defaultValue={previous?.birthMonth ? String(previous.birthMonth) : ''}
                  aria-invalid={errors.birthday ? true : undefined}
                >
                  <option value="">Month</option>
                  {MONTHS.map((month, i) => (
                    <option key={month} value={i + 1}>
                      {month}
                    </option>
                  ))}
                </Select>
                <Input
                  name="birthYear"
                  aria-label="Year (optional)"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Year"
                  defaultValue={previous?.birthYear ? String(previous.birthYear) : ''}
                  className="tabular-nums"
                />
              </div>
              {errors.birthday ? (
                <p className="text-[12px] text-danger" role="alert">
                  {errors.birthday}
                </p>
              ) : (
                <p className="text-[12px] text-text-subtle">So the club can wish you a happy birthday. The year is optional.</p>
              )}
            </fieldset>
          </div>
        )}
      </Section>

      <Section n={++section} title="Your membership">
        {fixedFee ? (
          <div className="space-y-1">
            <p className="text-[14px] text-text">
              <span className="font-semibold tabular-nums">{fixedFee.amountCents > 0 ? amount : 'Nothing to pay'}</span>
              <span className="text-text-muted"> · {fixedFee.label}</span>
            </p>
            {fixedFee.note && <p className="text-[12.5px] text-text-muted">{fixedFee.note}</p>}
          </div>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[13px] font-medium text-text">How long are you joining for?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {choices.map((choice) => (
                <label
                  key={choice.tier}
                  className={cn(pillClass(tier === choice.tier), 'h-auto justify-between rounded-[var(--radius-sm)] px-3.5 py-3 text-[13.5px]')}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="tier"
                      value={choice.tier}
                      checked={tier === choice.tier}
                      onChange={() => setTier(choice.tier)}
                      className="accent-[var(--brand-ink)]"
                    />
                    {TIER_LABEL[choice.tier]}
                  </span>
                  <span className="tabular-nums text-text-muted">{formatSgd(choice.amountCents)}</span>
                </label>
              ))}
            </div>
            {errors.tier ? (
              <p className="text-[12px] text-danger" role="alert">
                {errors.tier}
              </p>
            ) : (
              <p className="text-[12px] text-text-subtle">
                Half term is for joining partway through. Exchange is for exchange students.
              </p>
            )}
          </fieldset>
        )}
      </Section>

      {questions.length > 0 && (
        <Section n={++section} title="A few questions from the exco">
          <div className="space-y-5">
            {questions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                previous={previous?.answers.find((a) => a.questionId === question.id)?.value}
                error={errors[question.id]}
              />
            ))}
          </div>
        </Section>
      )}

      <Section n={++section} title="Pay">
        {!asksForPayment ? (
          <p className="text-[14px] leading-relaxed text-text">
            {amountCents === 0
              ? 'Nothing to pay for this term.'
              : payment === 'CONFIRMED'
                ? `Paid, thank you. Nothing more to do.`
                : payment === 'HELD'
                  ? 'Your payment is with the exco. They check it once you’re on the roster.'
                  : 'Your payment is with the exco to check. Nothing more to do.'}
          </p>
        ) : (
          <div className="space-y-5">
            {payment === 'REJECTED' && (
              <Notice tone="danger">The exco couldn&rsquo;t match your last payment. Send it again below.</Notice>
            )}
            <div className="flex flex-wrap items-start gap-5">
              {props.hasQr ? (
                // Streamed by a route that re-checks membership, never cached.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/${orgSlug}/fees/qr/${termId}`}
                  alt={`PayNow QR for the ${props.termName} membership fee`}
                  className="h-[180px] w-[180px] shrink-0 rounded-[var(--radius-sm)] border border-border bg-white object-contain p-2"
                />
              ) : (
                <div className="flex h-[180px] w-[180px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 text-center text-[12px] leading-relaxed text-text-subtle">
                  The PayNow QR isn&rsquo;t up yet. Ask the treasurer.
                </div>
              )}
              <ol className="min-w-[13rem] flex-1 space-y-2.5 text-[13.5px] leading-relaxed">
                <Step n={1}>Scan the QR in your banking app, or save it and open it there.</Step>
                <Step n={2}>
                  Pay exactly <span className="font-semibold tabular-nums">{amount}</span>.
                </Step>
                <Step n={3}>Copy the reference and take a screenshot of the confirmation.</Step>
              </ol>
            </div>

            <Field
              label="PayNow reference"
              htmlFor="reference"
              error={errors.reference}
              hint="From your confirmation. It’s how the exco find you on the bank statement."
            >
              <Input
                id="reference"
                name="reference"
                maxLength={64}
                autoComplete="off"
                aria-invalid={errors.reference ? true : undefined}
              />
            </Field>

            <Field
              label="Screenshot of the confirmation"
              htmlFor="proof"
              error={errors.proof}
              hint="PNG or JPEG. Only the exco ever see it."
            >
              <input
                id="proof"
                type="file"
                name="proof"
                accept="image/png,image/jpeg"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  setScreenshot(file ? URL.createObjectURL(file) : null)
                }}
                className="block w-full text-[13px] text-text-muted file:mr-3 file:h-9 file:rounded-[var(--radius-sm)] file:border file:border-border-strong file:bg-surface file:px-3 file:text-[13px] file:font-medium file:text-text hover:file:bg-surface-hover"
              />
            </Field>
            {screenshot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={screenshot}
                alt="The screenshot you are about to send"
                className="max-h-[240px] rounded-[var(--radius-sm)] border border-border"
              />
            )}
          </div>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" size="lg" loading={pending} disabled={preview}>
          {previous ? 'Save changes' : asksForPayment ? `Send, I’ve paid ${amount}` : 'Send'}
        </Button>
        {preview && <span className="text-[12.5px] text-text-muted">This is a preview, so nothing sends.</span>}
      </div>
    </form>
  )
}

function QuestionField({
  question,
  previous,
  error,
}: {
  question: Question
  previous: string | string[] | undefined
  error: string | undefined
}) {
  const name = fieldName(question.id)
  const id = `question-${question.id}`
  const label = (
    <>
      {question.label}
      {question.required && (
        <span className="ml-0.5 text-danger" aria-hidden>
          *
        </span>
      )}
    </>
  )

  const footer = error ? (
    <p className="text-[12px] text-danger" role="alert">
      {error}
    </p>
  ) : question.help ? (
    <p className="text-[12px] text-text-subtle">{question.help}</p>
  ) : null

  if (question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        {question.type === 'SHORT_TEXT' ? (
          <Input id={id} name={name} maxLength={200} defaultValue={typeof previous === 'string' ? previous : ''} aria-invalid={error ? true : undefined} />
        ) : (
          <Textarea id={id} name={name} rows={3} maxLength={2000} defaultValue={typeof previous === 'string' ? previous : ''} aria-invalid={error ? true : undefined} />
        )}
        {footer}
      </div>
    )
  }

  const options = question.type === 'YES_NO' ? ['Yes', 'No'] : question.options
  const many = question.type === 'MANY_CHOICES'
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-text">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <ChoicePill
            key={option}
            type={many ? 'checkbox' : 'radio'}
            name={name}
            value={option}
            defaultChecked={Array.isArray(previous) ? previous.includes(option) : previous === option}
          />
        ))}
      </div>
      {footer}
    </fieldset>
  )
}

/** A radio or checkbox that looks like the pills everywhere else. */
function ChoicePill({
  type,
  name,
  value,
  defaultChecked,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  defaultChecked: boolean
}) {
  return (
    <label className={cn(pillClass(false), 'has-[:checked]:border-brand-ink has-[:checked]:bg-paper has-[:checked]:text-text')}>
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="accent-[var(--brand-ink)]" />
      {value}
    </label>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2.5 text-[15px] font-semibold text-text">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-ink text-[12px] font-semibold text-surface">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12px] text-text-subtle">{hint}</p>
      )}
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-semibold text-accent-700">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}
