'use client'

import { useActionState } from 'react'
import { uploadOrgLogo, removeOrgLogo, type OrgSettingsState } from '@/actions/organisation'
import { Button } from '@/core/ui/button'

export function LogoForm({ orgSlug, currentLogo }: { orgSlug: string; currentLogo: string | null }) {
  const [state, formAction, pending] = useActionState<OrgSettingsState, FormData>(
    uploadOrgLogo.bind(null, orgSlug),
    { error: null }
  )

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="flex h-[96px] w-[180px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border bg-white p-3">
        {currentLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentLogo} alt="Current logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[12.5px] text-text-subtle">No logo yet</span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <form action={formAction} className="space-y-3">
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg"
            required
            aria-label="Logo image"
            className="block w-full text-[13px] text-text-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-text hover:file:bg-surface-hover"
          />
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            A PNG with a transparent background prints best. It goes in the top left of the
            attendance sheet. Months already raised keep the logo they were raised with.
          </p>
          {state.error && (
            <p className="text-[13px] text-danger" role="alert">
              {state.error}
            </p>
          )}
          {state.ok && !state.error && (
            <p className="text-[13px] text-success" role="status">
              Saved. New documents carry it.
            </p>
          )}
          <Button type="submit" loading={pending}>
            {currentLogo ? 'Replace logo' : 'Upload logo'}
          </Button>
        </form>
        {currentLogo && (
          <form action={removeOrgLogo.bind(null, orgSlug)}>
            <Button type="submit" variant="ghost" size="sm">
              Remove logo
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
