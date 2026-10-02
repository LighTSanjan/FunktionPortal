'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setFormState } from '@/modules/membership-form/form-actions'
import { Button } from '@/core/ui/button'
import { linkButtonClass } from '../../_components/ui'

/**
 * The buttons that run the form: open it, close it, open it again, share it,
 * look at it. Always in the same place at the top of the screen, whichever
 * tab is showing, because "is the form open?" is the first question and
 * "open it" is the first job.
 */
export function FormControls({
  orgSlug,
  termId,
  state,
  banked,
  blockers,
}: {
  orgSlug: string
  termId: string
  state: 'DRAFT' | 'OPEN' | 'CLOSED'
  banked: boolean
  /** What still has to be set before the form can open, e.g. "the PayNow QR". */
  blockers: string[]
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const preview = `/${orgSlug}/fees?term=${termId}&preview=1`

  function change(next: 'OPEN' | 'CLOSED') {
    setError(null)
    start(async () => {
      const result = await setFormState(orgSlug, termId, next)
      setConfirmClose(false)
      if (result.error) setError(result.error)
    })
  }

  async function copy() {
    const link = `${window.location.origin}/${orgSlug}/fees`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy the link to the form', link)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={preview} className={linkButtonClass('secondary')}>
          Preview
        </Link>

        {!banked && state === 'OPEN' && !confirmClose && (
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmClose(true)}>
              Close the form
            </Button>
            <Button type="button" onClick={copy}>
              {copied ? 'Link copied' : 'Copy link'}
            </Button>
          </>
        )}

        {!banked && state === 'OPEN' && confirmClose && (
          <>
            <span className="text-[13px] text-text">Stop taking responses?</span>
            <Button type="button" variant="danger" loading={pending} onClick={() => change('CLOSED')}>
              Close it
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmClose(false)}>
              Keep it open
            </Button>
          </>
        )}

        {!banked && state !== 'OPEN' && (
          <Button
            type="button"
            loading={pending}
            disabled={blockers.length > 0}
            onClick={() => change('OPEN')}
            title={blockers.length > 0 ? `Add ${blockers.join(' and ')} first` : undefined}
          >
            {state === 'CLOSED' ? 'Reopen the form' : 'Open the form'}
          </Button>
        )}
      </div>

      {!banked && state !== 'OPEN' && blockers.length > 0 && (
        <p className="text-[12px] text-text-muted">Add {blockers.join(' and ')} to open it.</p>
      )}
      {error && (
        <p className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
