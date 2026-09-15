'use client'

import { useActionState, useMemo, useState } from 'react'
import { saveAudience, type FormActionState } from '@/modules/membership-form/actions'
import { Button } from '@/core/ui/button'
import { Notice, pillClass } from '../../_components/ui'

/**
 * Who gets the form: everybody, or only the people ticked.
 *
 * The roster sits in a box of its own that scrolls, with a search above it,
 * rather than as a list that runs the page down past everything below it.
 * "Select all" ticks whoever the search is showing, so "everybody called Tan"
 * is two keystrokes and a click.
 */
export function AudiencePicker({
  orgSlug,
  termId,
  audience,
  chosen,
  roster,
  locked,
}: {
  orgSlug: string
  termId: string
  audience: 'EVERYONE' | 'CHOSEN'
  chosen: string[]
  roster: { id: string; fullName: string; studentId: string | null }[]
  locked: boolean
}) {
  const [mode, setMode] = useState(audience)
  const [picked, setPicked] = useState<Set<string>>(new Set(chosen))
  const [query, setQuery] = useState('')
  const [state, act, pending] = useActionState<FormActionState, FormData>(saveAudience.bind(null, orgSlug), {
    error: null,
  })

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? roster.filter((row) => row.fullName.toLowerCase().includes(needle) || (row.studentId ?? '').includes(needle))
      : roster
  }, [roster, query])
  const allVisiblePicked = visible.length > 0 && visible.every((row) => picked.has(row.id))

  function toggle(id: string) {
    setPicked((now) => {
      const next = new Set(now)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisible() {
    setPicked((now) => {
      const next = new Set(now)
      for (const row of visible) {
        if (allVisiblePicked) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })
  }

  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="audience" value={mode} />
      {mode === 'CHOSEN' && [...picked].map((id) => <input key={id} type="hidden" name="memberId" value={id} />)}

      <fieldset className="flex flex-wrap gap-2" disabled={locked}>
        <legend className="sr-only">Who gets this form</legend>
        <button type="button" aria-pressed={mode === 'EVERYONE'} onClick={() => setMode('EVERYONE')} className={pillClass(mode === 'EVERYONE')}>
          Everyone
        </button>
        <button type="button" aria-pressed={mode === 'CHOSEN'} onClick={() => setMode('CHOSEN')} className={pillClass(mode === 'CHOSEN')}>
          Only people I choose
        </button>
      </fieldset>

      <p className="max-w-[68ch] text-[12.5px] leading-relaxed text-text-muted">
        {mode === 'EVERYONE'
          ? 'Every member can fill it in, including new people who aren’t on the roster yet.'
          : 'Only the people ticked can fill it in. Everyone else is told the form isn’t for them. New people who aren’t on the roster can’t reach it.'}
      </p>

      {mode === 'CHOSEN' && (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-paper/50 p-2.5">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a name or student ID"
              aria-label="Search the roster"
              disabled={locked}
              className="lapis-field h-9 min-w-0 flex-1 basis-48 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-[13px] text-text"
            />
            <Button type="button" size="sm" variant="secondary" onClick={toggleVisible} disabled={locked || visible.length === 0}>
              {allVisiblePicked ? 'Clear these' : query ? `Select these ${visible.length}` : 'Select all'}
            </Button>
            <span className="ml-auto text-[12.5px] tabular-nums text-text-muted">
              {picked.size} chosen
            </span>
          </div>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto overscroll-contain" aria-label="Roster">
            {visible.length === 0 ? (
              <li className="px-4 py-6 text-center text-[13px] text-text-muted">Nobody matches &ldquo;{query}&rdquo;.</li>
            ) : (
              visible.map((row) => (
                <li key={row.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      checked={picked.has(row.id)}
                      onChange={() => toggle(row.id)}
                      disabled={locked}
                      className="accent-[var(--brand-ink)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">{row.fullName}</span>
                    <span className="text-[12px] tabular-nums text-text-subtle">{row.studentId ?? ''}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}
      {state.ok && !state.error && state.message && (
        <Notice tone="success" role="status">
          {state.message}
        </Notice>
      )}

      {!locked && (
        <Button type="submit" loading={pending}>
          Save who gets it
        </Button>
      )}
    </form>
  )
}
