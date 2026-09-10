'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { setAttendance, type ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'

interface RosterEntry {
  memberId: string
  fullName: string
  studentId: string | null
  present: boolean
}

export function AttendanceForm({
  orgSlug,
  sessionId,
  roster,
  readOnly,
}: {
  orgSlug: string
  sessionId: string
  roster: RosterEntry[]
  readOnly: boolean
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setAttendance.bind(null, orgSlug, sessionId),
    { error: null }
  )

  // Local state keeps the count and bulk controls in sync with unsaved boxes.
  const [present, setPresent] = React.useState<Set<string>>(
    () => new Set(roster.filter((r) => r.present).map((r) => r.memberId))
  )

  function toggle(memberId: string) {
    setPresent((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-muted">
          <span className="font-semibold tabular-nums text-text">{present.size}</span> of{' '}
          {roster.length} present
        </p>
        {!readOnly && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPresent(new Set(roster.map((r) => r.memberId)))}
            >
              All present
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPresent(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}
      {state.ok && !state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-success/20 bg-success/8 p-3 text-[13px] text-success"
          role="status"
        >
          Register saved.
        </div>
      )}

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {roster.map((entry) => {
          const checked = present.has(entry.memberId)
          return (
            <li key={entry.memberId}>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2 transition-colors duration-[var(--dur-1)] ${
                  checked
                    ? 'border-brand-ink bg-paper'
                    : 'border-border bg-surface hover:bg-surface-hover'
                } ${readOnly ? 'pointer-events-none opacity-70' : ''}`}
              >
                <input
                  type="checkbox"
                  name="present"
                  value={entry.memberId}
                  checked={checked}
                  onChange={() => toggle(entry.memberId)}
                  disabled={readOnly}
                  className="h-4 w-4 rounded border-border-strong accent-[var(--accent-500)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-text">{entry.fullName}</span>
                  {entry.studentId && (
                    <span className="block font-mono text-[11px] text-text-subtle">
                      {entry.studentId}
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {!readOnly && (
        <Button type="submit" loading={pending}>
          Save register
        </Button>
      )}
    </form>
  )
}
