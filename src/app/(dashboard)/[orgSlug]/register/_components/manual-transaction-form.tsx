'use client'

import { useActionState } from 'react'
import { createManualRegisterEntry, type RegisterActionState } from '@/modules/register/actions'
import { Button } from '@/core/ui/button'
import { FormField } from '@/core/ui/form-field'
import { Input } from '@/core/ui/input'
import { Select } from '@/core/ui/select'

export function ManualTransactionForm({ orgSlug, today }: { orgSlug: string; today: string }) {
  const [state, action, pending] = useActionState<RegisterActionState, FormData>(
    createManualRegisterEntry.bind(null, orgSlug),
    { error: null }
  )

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error && (
        <p className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger sm:col-span-2" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-[var(--radius-sm)] border border-success/20 bg-success/8 p-3 text-[13px] text-success sm:col-span-2" role="status">
          Transaction recorded. Add another, or close this section.
        </p>
      )}

      <FormField label="Money movement" htmlFor="manual-kind" required>
        <Select id="manual-kind" name="kind" defaultValue="EXPENSE" required>
          <option value="EXPENSE">Money out</option>
          <option value="INCOME">Money in</option>
        </Select>
      </FormField>
      <FormField label="Fund / register" htmlFor="manual-section" required>
        <Select id="manual-section" name="section" defaultValue="INCOME" required>
          <option value="SEED_FUND">OSL Seed Fund</option>
          <option value="INCOME">Income</option>
          <option value="DONATION">Donations</option>
          <option value="UNOFFICIAL">Unofficial</option>
        </Select>
      </FormField>
      <FormField label="Transaction date" htmlFor="manual-date" required>
        <Input id="manual-date" name="documentDate" type="date" defaultValue={today} required />
      </FormField>
      <FormField label="Amount (SGD)" htmlFor="manual-amount" required>
        <Input id="manual-amount" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required />
      </FormField>
      <FormField label="Description" htmlFor="manual-description" required className="sm:col-span-2">
        <Input id="manual-description" name="description" maxLength={240} required placeholder="What was this for?" />
      </FormField>
      <FormField label="Paid to / received from" htmlFor="manual-counterparty" hint="Optional">
        <Input id="manual-counterparty" name="counterparty" maxLength={160} />
      </FormField>
      <FormField label="Reference number" htmlFor="manual-reference" hint="Optional bank or OSL reference">
        <Input id="manual-reference" name="reference" maxLength={80} />
      </FormField>
      <FormField label="Submitted to OSL" htmlFor="manual-submitted" hint="Optional">
        <Input id="manual-submitted" name="submittedToOslAt" type="date" />
      </FormField>
      <FormField label="Banked in" htmlFor="manual-banked" hint="Optional">
        <Input id="manual-banked" name="bankedInAt" type="date" />
      </FormField>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>Record transaction</Button>
      </div>
    </form>
  )
}
