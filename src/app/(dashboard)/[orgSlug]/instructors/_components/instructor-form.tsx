'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { saveInstructor, type ActionState } from '@/modules/coach-claim/actions'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'
import { FormField } from '@/core/ui/form-field'
import { Card, CardContent, CardHeader, CardTitle } from '@/core/ui/card'

export interface InstructorFormValues {
  id: string | null
  fullName: string
  shortCode: string
  danceStyle: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  bankName: string
  bankAccountNo: string
  engagement: 'CONTRACTED' | 'GUEST'
  contractRef: string
}

export function InstructorForm({
  orgSlug,
  values,
}: {
  orgSlug: string
  values: InstructorFormValues
}) {
  const router = useRouter()

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveInstructor.bind(null, orgSlug, values.id),
    { error: null }
  )

  // A new instructor has no page of its own to return to, so the list is where
  // "saved" is actually visible. Editing stays put: the rate panel sits below
  // this form and bouncing away from it would make adding a rate a two-trip job.
  useEffect(() => {
    if (state.ok && !values.id) router.push(`/${orgSlug}/instructors`)
  }, [state.ok, values.id, orgSlug, router])

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-[var(--radius-sm)] bg-danger/10 p-3 text-[13px] text-danger" role="alert">
          {state.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
            Who they are
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" htmlFor="fullName" required>
            <Input id="fullName" name="fullName" defaultValue={values.fullName} required />
          </FormField>
          <FormField
            label="Class or style"
            htmlFor="danceStyle"
            required
            hint="Prints on every invoice line and in the sheet header"
          >
            <Input id="danceStyle" name="danceStyle" defaultValue={values.danceStyle} required />
          </FormField>
          <FormField
            label="Document code"
            htmlFor="shortCode"
            hint="Their own invoice numbering, e.g. KS. Left blank, initials are used."
          >
            <Input id="shortCode" name="shortCode" defaultValue={values.shortCode} />
          </FormField>
          <FormField
            label="Engagement"
            htmlFor="engagement"
            hint="Guests bill at whatever was agreed for that workshop"
          >
            <Select id="engagement" name="engagement" defaultValue={values.engagement}>
              <option value="CONTRACTED">Contracted</option>
              <option value="GUEST">Guest</option>
            </Select>
          </FormField>
          <FormField label="Contract reference" htmlFor="contractRef">
            <Input id="contractRef" name="contractRef" defaultValue={values.contractRef} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
            How to reach them
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values.email} />
          </FormField>
          <FormField label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values.phone} />
          </FormField>
          <FormField
            label="Address line 1"
            htmlFor="addressLine1"
            hint="Prints as the masthead on their invoice"
          >
            <Input id="addressLine1" name="addressLine1" defaultValue={values.addressLine1} />
          </FormField>
          <FormField label="Address line 2" htmlFor="addressLine2">
            <Input id="addressLine2" name="addressLine2" defaultValue={values.addressLine2} />
          </FormField>
          <FormField label="Postal code" htmlFor="postalCode">
            <Input id="postalCode" name="postalCode" defaultValue={values.postalCode} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
            How they get paid
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[13px] text-text-muted">
            Both are required before an invoice will generate. An invoice missing them looks
            complete and pays nobody.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Bank" htmlFor="bankName">
              <Input id="bankName" name="bankName" defaultValue={values.bankName} />
            </FormField>
            <FormField label="Account number" htmlFor="bankAccountNo">
              <Input
                id="bankAccountNo"
                name="bankAccountNo"
                defaultValue={values.bankAccountNo}
                // Never offer to remember or refill a payee account number.
                autoComplete="off"
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {values.id ? 'Save changes' : 'Add instructor'}
        </Button>
        {state.ok && values.id && (
          <span className="text-[13px] text-success" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  )
}
