'use client'

import { useActionState, useState } from 'react'
import { declarePayment, type FeeState } from '@/modules/fees/actions'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'

export function DeclareForm({
  orgSlug,
  termId,
  amount,
  redeclaring,
}: {
  orgSlug: string
  termId: string
  amount: string
  /** A previous declaration exists; this one replaces it. */
  redeclaring: boolean
}) {
  const [state, formAction, pending] = useActionState<FeeState, FormData>(
    declarePayment.bind(null, orgSlug),
    { error: null }
  )
  const [chosen, setChosen] = useState<string | null>(null)

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="termId" value={termId} />

      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <FormField
        label="Payment reference"
        htmlFor="reference"
        required
        hint="From your PayNow confirmation. It is how the exco finds your line on the bank statement."
      >
        <Input id="reference" name="reference" required maxLength={64} autoComplete="off" />
      </FormField>

      <FormField
        label="Screenshot of the confirmation"
        htmlFor="proof"
        required
        hint="PNG or JPEG. Nobody outside the exco ever sees it, and it never leaves the portal."
      >
        <input
          id="proof"
          type="file"
          name="proof"
          accept="image/png,image/jpeg"
          required
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            setChosen(file ? URL.createObjectURL(file) : null)
          }}
          className="block w-full text-[13px] text-text-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-text hover:file:bg-surface-hover"
        />
      </FormField>

      {chosen && (
        <figure className="m-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={chosen}
            alt="The screenshot you are about to send"
            className="max-h-[260px] rounded-[var(--radius-sm)] border border-border"
          />
          <figcaption className="mt-1.5 text-[12px] text-text-subtle">
            Check the amount and the reference are readable before you send it.
          </figcaption>
        </figure>
      )}

      <Button type="submit" loading={pending}>
        {redeclaring ? `Replace my declaration (${amount})` : `I have paid ${amount}`}
      </Button>

      <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-text-subtle">
        This records that you say you have paid. An exco member checks it against the bank
        statement and confirms it separately &mdash; and never their own.
      </p>
    </form>
  )
}
