'use client'

import { useActionState } from 'react'
import { updateOrgSettings, type OrgSettingsState } from '@/actions/organisation'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'
import { FormField } from '@/core/ui/form-field'

export interface OrgSettingsValues {
  name: string
  tagline: string
  institutionShortName: string
  submissionEmail: string
  billToName: string
  billToAddressLines: string
  projectCode: string
  cluster: string
  gstPercent: string
  brandBandColors: string
}

export function OrgSettingsForm({
  orgSlug,
  values,
}: {
  orgSlug: string
  values: OrgSettingsValues
}) {
  const [state, formAction, pending] = useActionState<OrgSettingsState, FormData>(
    updateOrgSettings.bind(null, orgSlug),
    { error: null }
  )

  return (
    <form action={formAction} className="space-y-8">
      {state.error && (
        <div
          className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] leading-relaxed text-danger"
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
          Saved. New documents will carry these; ones already generated are rebuilt from their own
          stored rows and keep what they were issued with.
        </div>
      )}

      <Section
        title="The organisation"
        blurb="How the club names itself on the documents it authors."
      >
        <FormField label="Name" htmlFor="name" required hint="Prints on the attendance sheet and under the countersignature">
          <Input id="name" name="name" defaultValue={values.name} required maxLength={120} />
        </FormField>
        <FormField label="Tagline" htmlFor="tagline" hint="Optional standfirst under the sheet's title">
          <Input id="tagline" name="tagline" defaultValue={values.tagline} maxLength={160} />
        </FormField>
        <FormField
          label="Institution, short form"
          htmlFor="institutionShortName"
          hint="Printed beside the club name on a coach's invoice. Leave blank to print the club alone."
        >
          <Input
            id="institutionShortName"
            name="institutionShortName"
            defaultValue={values.institutionShortName}
            maxLength={40}
          />
        </FormField>
      </Section>

      <Section
        title="Filing"
        blurb="Where the paperwork goes, and the numbers it is filed under. Changing the project code changes every reference number issued from now on; numbers already issued keep theirs."
      >
        <FormField
          label="Submission address"
          htmlFor="submissionEmail"
          hint="Fills the To: field when you send a month. The portal never sends on your behalf."
        >
          <Input
            id="submissionEmail"
            name="submissionEmail"
            type="email"
            defaultValue={values.submissionEmail}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Project code"
            htmlFor="projectCode"
            required
            hint="The three digits in IV26-XXX-0001"
          >
            <Input
              id="projectCode"
              name="projectCode"
              defaultValue={values.projectCode}
              required
              inputMode="numeric"
              maxLength={3}
              className="font-mono"
            />
          </FormField>
          <FormField label="Cluster" htmlFor="cluster" required hint="Decides the code inside the WBS element">
            <Input id="cluster" name="cluster" defaultValue={values.cluster} required maxLength={40} />
          </FormField>
        </div>
        <FormField
          label="GST rate"
          htmlFor="gstPercent"
          required
          hint="Applied to income. Donations are exempt and never carry it."
        >
          <Input
            id="gstPercent"
            name="gstPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={values.gstPercent}
            required
            className="max-w-[8rem] tabular-nums"
          />
        </FormField>
      </Section>

      <Section
        title="Who the coach bills"
        blurb="The invoice is the coach's own document, billed to the university rather than to the club. This is the address that prints on it — it belongs to the university and can change without asking us."
      >
        <FormField label="Billed to" htmlFor="billToName">
          <Input id="billToName" name="billToName" defaultValue={values.billToName} maxLength={160} />
        </FormField>
        <FormField label="Address" htmlFor="billToAddressLines" hint="One line per line">
          <Textarea
            id="billToAddressLines"
            name="billToAddressLines"
            defaultValue={values.billToAddressLines}
            rows={3}
          />
        </FormField>
      </Section>

      <Section
        title="The banded rule"
        blurb="The stripe under the masthead on club-authored documents. One six-digit hex colour per line, no hash. Leave it empty to draw no rule — the document renderer holds no palette of its own, so this is the whole of it."
      >
        <FormField label="Bands" htmlFor="brandBandColors">
          <Textarea
            id="brandBandColors"
            name="brandBandColors"
            defaultValue={values.brandBandColors}
            rows={4}
            className="font-mono"
          />
        </FormField>
      </Section>

      <Button type="submit" loading={pending}>
        Save settings
      </Button>
    </form>
  )
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">{blurb}</p>
      </div>
      {children}
    </section>
  )
}
