'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { mapDate, type ActionState } from '@/modules/attendance/actions'

export interface DateRowProps {
  orgSlug: string
  importId: string
  iso: string
  header: string
  sheetLabel: string | null
  instructorId: string | null
  minutes: number
  overridden: boolean
  presentCount: number
  instructors: { id: string; fullName: string; shortCode: string }[]
  locked: boolean
}

export function DateRow(props: DateRowProps) {
  const action = mapDate.bind(null, props.orgSlug)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { error: null })

  const weekday = new Date(`${props.iso}T00:00:00Z`).toLocaleDateString('en-SG', {
    weekday: 'short',
    timeZone: 'UTC',
  })

  return (
    <tr className="border-b border-border last:border-0">
      <td className="whitespace-nowrap px-5 py-2 align-middle">
        <span className="text-[13px] font-medium tabular-nums text-text">{props.header}</span>
        <span className="ml-2 text-[11.5px] text-text-subtle">{weekday}</span>
      </td>
      <td className="py-2 pr-4 align-middle text-[12.5px] tabular-nums text-text-muted">
        {props.presentCount}
      </td>
      <td className="py-2 pr-4 align-middle text-[12px] text-text-subtle">
        {props.sheetLabel ?? <span className="text-warning">nobody</span>}
      </td>
      <td className="py-2 pr-5 align-middle">
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="importId" value={props.importId} />
          <input type="hidden" name="iso" value={props.iso} />
          <Field
            name="instructorId"
            defaultValue={props.instructorId ?? ''}
            disabled={props.locked}
            className="min-w-[9rem]"
          >
            <option value="">Not a coached class</option>
            {props.instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.fullName}
              </option>
            ))}
          </Field>
          <Field name="minutes" defaultValue={String(props.minutes || 90)} disabled={props.locked}>
            <option value="90">1.5 h</option>
            <option value="180">3 h</option>
            <option value="120">2 h</option>
            <option value="60">1 h</option>
          </Field>
          <Saving overridden={props.overridden} error={state.error} />
        </form>
      </td>
    </tr>
  )
}

function Field({
  name,
  defaultValue,
  disabled,
  className,
  children,
}: {
  name: string
  defaultValue: string
  disabled: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className={`lapis-field h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[12.5px] text-text disabled:opacity-60 ${className ?? ''}`}
    >
      {children}
    </select>
  )
}

function Saving({ overridden, error }: { overridden: boolean; error: string | null }) {
  const { pending } = useFormStatus()
  if (pending) return <span className="text-[11.5px] text-text-subtle">saving…</span>
  if (error) return <span className="text-[11.5px] text-danger">{error}</span>
  if (overridden) return <span className="text-[11.5px] text-text-subtle">changed</span>
  return null
}
