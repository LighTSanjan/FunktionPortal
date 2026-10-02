'use client'

import { useActionState } from 'react'
import { updateProfile, type ProfileState } from '@/actions/profile'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'
import { FormField } from '@/core/ui/form-field'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export interface ProfileDetails {
  name: string
  email: string
  studentId: string
  /** On the roster: the student ID is the roster's, and only the exco change it. */
  onRoster: boolean
  birthDay: string
  birthMonth: string
  birthYear: string
}

export function ProfileForm({ orgSlug, details }: { orgSlug: string; details: ProfileDetails }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfile.bind(null, orgSlug),
    { error: null }
  )
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate className="space-y-5">
      <FormField label="Full name" htmlFor="name" required error={errors.name}>
        <Input id="name" name="name" autoComplete="name" defaultValue={details.name} maxLength={120} />
      </FormField>

      <FormField
        label="Student ID"
        htmlFor="studentId"
        error={errors.studentId}
        hint={details.onRoster ? 'From the club roster. If it’s wrong, tell the exco.' : undefined}
      >
        <Input
          id="studentId"
          name="studentId"
          inputMode="numeric"
          autoComplete="off"
          maxLength={40}
          defaultValue={details.studentId}
          readOnly={details.onRoster}
          disabled={details.onRoster}
          className="tabular-nums"
        />
      </FormField>

      <fieldset className="space-y-1.5" aria-describedby={errors.birthday ? 'birthday-error' : undefined}>
        <legend className="text-[13px] font-medium text-text">Birthday</legend>
        <div className="grid max-w-sm grid-cols-[5rem_1fr_6rem] gap-2">
          <Input aria-label="Day" name="birthDay" inputMode="numeric" placeholder="Day" maxLength={2} defaultValue={details.birthDay} />
          <Select aria-label="Month" name="birthMonth" defaultValue={details.birthMonth}>
            <option value="">Month</option>
            {MONTHS.map((month, index) => (
              <option key={month} value={String(index + 1)}>
                {month}
              </option>
            ))}
          </Select>
          <Input aria-label="Year (optional)" name="birthYear" inputMode="numeric" placeholder="Year" maxLength={4} defaultValue={details.birthYear} />
        </div>
        {errors.birthday && (
          <p id="birthday-error" className="text-[12px] text-danger" role="alert">
            {errors.birthday}
          </p>
        )}
      </fieldset>

      {/* The address is the account you sign in with; changing it here would
          disagree with the credential itself. */}
      <FormField label="Email" htmlFor="email">
        <Input id="email" value={details.email} readOnly disabled />
      </FormField>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Save
        </Button>
        {state.ok && !state.error && (
          <span className="text-[13px] text-success" role="status">
            Saved.
          </span>
        )}
        {state.error && !state.fieldErrors && (
          <span className="text-[13px] text-danger" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
  )
}
