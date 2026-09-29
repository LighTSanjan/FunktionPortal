'use client'

import { useActionState, useMemo, useState, useTransition } from 'react'
import { clearHeldPayment, matchResponse, removeResponse, type FormActionState } from '@/modules/membership-form/actions'
import { answerText, type Answer } from '@/modules/membership-form/questions'
import { formatSgd } from '@/modules/coach-claim/money'
import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Select } from '@/core/ui/select'
import { Input } from '@/core/ui/input'
import { Notice, pillClass } from '../../_components/ui'

export interface ResponseView {
  id: string
  email: string
  memberId: string | null
  memberName: string | null
  fullName: string
  studentId: string | null
  answers: Answer[]
  held: { reference: string | null; amountCents: number | null; hasProof: boolean } | null
  /** Formatted on the server, in Singapore time, so the page renders the same twice. */
  sentShort: string
  sentLong: string
  edited: boolean
  matchedByName: string | null
  joiningAs: 'NEW' | 'RETURNING' | null
  candidates: { id: string; fullName: string; studentId: string | null; reasons: string[]; sameAccount: boolean }[]
  idTakenBy: string | null
}

type Filter = 'all' | 'match' | 'roster'

/**
 * Everybody who has filled in the form, newest first.
 *
 * The ones not on the roster yet are the exco's to sort, so they come with
 * the rows they might be and a one-press way to put them on — against an
 * existing row, or as somebody new.
 */
export function ResponsesList({
  orgSlug,
  responses,
  roster,
  locked,
}: {
  orgSlug: string
  responses: ResponseView[]
  /** Roster rows with no account yet, for matching by hand. */
  roster: { id: string; fullName: string; studentId: string | null }[]
  locked: boolean
}) {
  const unmatched = responses.filter((r) => !r.memberId).length
  const [filter, setFilter] = useState<Filter>(unmatched > 0 ? 'match' : 'all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return responses.filter(
      (r) =>
        (filter === 'all' || (filter === 'match' ? !r.memberId : Boolean(r.memberId))) &&
        (!needle ||
          r.fullName.toLowerCase().includes(needle) ||
          (r.studentId ?? '').includes(needle) ||
          r.email.toLowerCase().includes(needle))
    )
  }, [responses, filter, query])

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Everyone', count: responses.length },
    { key: 'match', label: 'Not on the roster yet', count: unmatched },
    { key: 'roster', label: 'On the roster', count: responses.length - unmatched },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a name, student ID or email"
          aria-label="Search responses"
          className="lapis-field h-9 min-w-0 flex-1 basis-56 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-[13px] text-text"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={pillClass(filter === f.key)}
            >
              {f.label}
              <span className="tabular-nums text-text-subtle">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {flash && (
        <Notice tone="success" role="status">
          {flash}
        </Notice>
      )}

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-muted">
            {responses.length === 0
              ? 'No responses yet. Once the form is open, share the link in the Telegram group.'
              : query
                ? `Nobody matches “${query}”.`
                : filter === 'match'
                  ? 'Everybody who responded is on the roster.'
                  : 'Nobody here.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((response) => {
              const isOpen = open === response.id
              return (
                <li key={response.id} className={isOpen ? 'bg-paper/60' : undefined}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : response.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block truncate text-[13.5px] font-medium text-text">{response.fullName}</span>
                      <span className="block truncate text-[11.5px] tabular-nums text-text-subtle">
                        {response.studentId ?? 'No student ID'} · {response.email}
                      </span>
                    </span>
                    <span className="flex w-44 flex-wrap items-center gap-1.5">
                      {response.memberId ? (
                        <Badge variant="success">On the roster</Badge>
                      ) : (
                        <Badge variant="warning">Not on the roster yet</Badge>
                      )}
                      {!response.memberId && response.joiningAs && (
                        <Badge variant="default">{response.joiningAs === 'NEW' ? 'Says new' : 'Says returning'}</Badge>
                      )}
                      {response.held && <Badge variant="info">Paid, held</Badge>}
                    </span>
                    <span className="w-20 text-right text-[11.5px] tabular-nums text-text-subtle">
                      {response.sentShort}
                    </span>
                  </button>

                  {isOpen && (
                    <ResponseDetail
                      orgSlug={orgSlug}
                      response={response}
                      roster={roster}
                      locked={locked}
                      onDone={(message) => {
                        setFlash(message)
                        setOpen(null)
                      }}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function ResponseDetail({
  orgSlug,
  response,
  roster,
  locked,
  onDone,
}: {
  orgSlug: string
  response: ResponseView
  roster: { id: string; fullName: string; studentId: string | null }[]
  locked: boolean
  onDone: (message: string | null) => void
}) {
  const [removing, setRemoving] = useState(false)
  const [removeReason, setRemoveReason] = useState('')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-4 border-t border-dashed border-border px-4 py-4">
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[10rem_1fr]">
        <Row label="On the roster as" value={response.memberName ?? 'Nobody yet'} />
        {!response.memberId && response.joiningAs && (
          <Row
            label="They said"
            value={
              response.joiningAs === 'NEW'
                ? 'They’re new to the club'
                : 'They’ve been a member before — look for their existing row'
            }
          />
        )}
        {response.matchedByName && <Row label="Matched by" value={response.matchedByName} />}
        <Row label="Sent" value={`${response.sentLong}${response.edited ? ' · edited since' : ''}`} />
        {response.answers.map((answer) => (
          <Row key={answer.questionId} label={answer.label} value={answerText(answer.value) || '—'} />
        ))}
      </dl>

      {response.held && (
        <div className="flex flex-wrap items-start gap-4 rounded-[var(--radius-sm)] border border-border bg-surface p-3">
          {response.held.hasProof && (
            <a
              href={`/${orgSlug}/fees/collection/responses/${response.id}/proof`}
              target="_blank"
              rel="noopener"
              title="Open the screenshot full size"
              className="block shrink-0"
            >
              {/* Streamed by a route that re-checks fee.manage on every request. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/${orgSlug}/fees/collection/responses/${response.id}/proof`}
                alt={`${response.fullName}'s payment screenshot`}
                className="max-h-[200px] w-auto max-w-[160px] rounded-[var(--radius-sm)] border border-border bg-white object-contain"
              />
            </a>
          )}
          <p className="min-w-[12rem] flex-1 text-[13px] leading-relaxed text-text">
            Paid{' '}
            <span className="font-semibold tabular-nums">
              {response.held.amountCents !== null ? formatSgd(response.held.amountCents) : ''}
            </span>
            {response.held.reference && (
              <>
                {' '}
                · reference <span className="font-mono">{response.held.reference}</span>
              </>
            )}
            .{' '}
            <span className="text-text-muted">
              {response.memberId
                ? 'It was not moved to their roster row. Check whether they paid twice.'
                : 'Held here until they are on the roster, then it goes to be checked like any other.'}
            </span>
          </p>
        </div>
      )}

      {response.memberId && response.held && !locked && (
        <ClearHeld orgSlug={orgSlug} responseId={response.id} onDone={onDone} />
      )}

      {!response.memberId && !locked && (
        <MatchForm orgSlug={orgSlug} response={response} roster={roster} onDone={onDone} />
      )}

      {!locked && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {removing ? (
            <>
              <span className="text-[12.5px] text-text">
                Remove {response.fullName}&rsquo;s response{response.held ? ' and the payment held on it' : ''}?
              </span>
              {response.held && (
                <Input
                  aria-label="What happened to the money"
                  value={removeReason}
                  onChange={(event) => setRemoveReason(event.target.value)}
                  maxLength={300}
                  placeholder="What happened to the money, e.g. refunded on 20 Sep"
                  className="min-w-[16rem] flex-1"
                />
              )}
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={pending}
                disabled={Boolean(response.held) && removeReason.trim().length < 3}
                onClick={() =>
                  start(async () => {
                    const result = await removeResponse(orgSlug, response.id, removeReason)
                    if (result.error) setRemoveError(result.error)
                    else onDone('Response removed.')
                  })
                }
              >
                Remove
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRemoving(false)
                  setRemoveError(null)
                }}
              >
                Keep it
              </Button>
              {removeError && (
                <p className="w-full text-[12.5px] text-danger" role="alert">
                  {removeError}
                </p>
              )}
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(true)}>
              Remove this response
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function MatchForm({
  orgSlug,
  response,
  roster,
  onDone,
}: {
  orgSlug: string
  response: ResponseView
  roster: { id: string; fullName: string; studentId: string | null }[]
  onDone: (message: string | null) => void
}) {
  const best = response.candidates[0]
  const [target, setTarget] = useState<string>(best ? best.id : 'NEW')
  const [state, act, pending] = useActionState<FormActionState, FormData>(async (previous, formData) => {
    const result = await matchResponse(orgSlug, previous, formData)
    if (!result.error) onDone(result.message ?? null)
    return result
  }, { error: null })

  const others = roster.filter((row) => !response.candidates.some((c) => c.id === row.id))

  return (
    <form action={act} className="space-y-3 rounded-[var(--radius-sm)] border border-brand-ink bg-surface p-4">
      <input type="hidden" name="responseId" value={response.id} />
      <input type="hidden" name="target" value={target} />

      <div>
        <p className="text-[13.5px] font-semibold text-text">Put {response.fullName} on the roster</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
          They weren&rsquo;t linked to a roster row when they sent this. Check it&rsquo;s really them — anyone can type a
          student ID.
        </p>
      </div>

      {response.idTakenBy && (
        <Notice tone="warning">
          Student ID {response.studentId} is {response.idTakenBy} on the roster, already linked to a different account.
          Check with both before doing anything.
        </Notice>
      )}

      <fieldset className="space-y-2">
        <legend className="sr-only">Which roster row</legend>
        {response.candidates.map((candidate) => (
          <Choice
            key={candidate.id}
            checked={target === candidate.id}
            onSelect={() => setTarget(candidate.id)}
            title={`${candidate.fullName}${candidate.studentId ? ` · ${candidate.studentId}` : ''}`}
            detail={candidate.reasons.join(', ')}
          />
        ))}
        <Choice
          checked={target === 'NEW'}
          onSelect={() => setTarget('NEW')}
          title="Add them as a new member"
          detail={
            response.candidates.length === 0
              ? 'Nobody on the roster looks like them.'
              : 'None of those is them.'
          }
        />
        {others.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pl-7">
            <label className="text-[12.5px] text-text-muted" htmlFor={`other-${response.id}`}>
              Or someone else:
            </label>
            <Select
              id={`other-${response.id}`}
              value={others.some((row) => row.id === target) ? target : ''}
              onChange={(event) => event.target.value && setTarget(event.target.value)}
              className="h-9 max-w-[18rem] text-[13px]"
            >
              <option value="">Pick a roster row</option>
              {others.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.fullName}
                  {row.studentId ? ` · ${row.studentId}` : ''}
                </option>
              ))}
            </Select>
          </div>
        )}
      </fieldset>

      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}

      <Button type="submit" loading={pending}>
        {target === 'NEW' ? 'Add to the roster' : 'Match to this row'}
      </Button>
    </form>
  )
}

function Choice({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2 ${
        checked ? 'border-brand-ink bg-paper' : 'border-border hover:bg-surface-hover'
      }`}
    >
      <input type="radio" checked={checked} onChange={onSelect} className="mt-1 accent-[var(--brand-ink)]" />
      <span>
        <span className="block text-[13px] font-medium text-text">{title}</span>
        <span className="block text-[12px] text-text-muted">{detail}</span>
      </span>
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-subtle">{label}</dt>
      <dd className="m-0 whitespace-pre-wrap break-words text-text">{value}</dd>
    </>
  )
}

function ClearHeld({
  orgSlug,
  responseId,
  onDone,
}: {
  orgSlug: string
  responseId: string
  onDone: (message: string | null) => void
}) {
  const [state, act, pending] = useActionState<FormActionState, FormData>(async (previous, formData) => {
    const result = await clearHeldPayment(orgSlug, previous, formData)
    if (!result.error) onDone(result.message ?? null)
    return result
  }, { error: null })

  return (
    <form action={act} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="responseId" value={responseId} />
      <div className="min-w-[16rem] flex-1 space-y-1.5">
        <label htmlFor={`reason-${responseId}`} className="text-[13px] font-medium text-text">
          Once you&rsquo;ve sorted out that money, clear it here
        </label>
        <Input id={`reason-${responseId}`} name="reason" maxLength={300} placeholder="Refunded on 20 Sep, or: the same payment sent twice" />
      </div>
      <Button type="submit" variant="secondary" loading={pending}>
        Clear the held payment
      </Button>
      {state.error && (
        <p className="w-full text-[12.5px] text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
