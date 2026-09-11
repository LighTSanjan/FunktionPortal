'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/core/ui/button'
import { Select } from '@/core/ui/select'
import { FormField } from '@/core/ui/form-field'
import { uploadSheet, type ActionState } from '@/modules/attendance/actions'

export interface TermOption {
  id: string
  name: string
  startDate: string
  endDate: string
}

export function UploadForm({ orgSlug, terms }: { orgSlug: string; terms: TermOption[] }) {
  const action = uploadSheet.bind(null, orgSlug)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { error: null })

  return (
    <form action={formAction} className="space-y-4">
      <FormField label="Term" htmlFor="termId">
        <Select id="termId" name="termId" defaultValue={terms[0]?.id ?? ''} required>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name} — {term.startDate} to {term.endDate}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Attendance sheet (CSV)"
        htmlFor="sheet"
        hint="In Google Sheets: File → Download → Comma-separated values. Export the attendance tab."
      >
        <input
          id="sheet"
          name="sheet"
          type="file"
          accept=".csv,text/csv"
          required
          className="lapis-field block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[13px] text-text file:mr-3 file:rounded-full file:border-0 file:bg-paper-deep file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-text"
        />
      </FormField>

      {state.error && (
        <p role="alert" className="text-[13px] leading-relaxed text-danger">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Reading the sheet…' : 'Read the sheet'}
    </Button>
  )
}
