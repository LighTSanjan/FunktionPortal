'use client'

import { useState } from 'react'
import { Button } from '@/core/ui/button'

/**
 * Fetched rather than linked: Chromium takes a few seconds to print the pack,
 * and a plain link gives no sign anything is happening until the file lands.
 */
export function DownloadPdf({ href, label = 'Download signed PDF', variant = 'secondary' }: { href: string; label?: string; variant?: 'primary' | 'secondary' }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setProblem(null)
    try {
      const response = await fetch(href)
      if (!response.ok) {
        setProblem((await response.text()) || 'The PDF could not be made. Try again.')
        return
      }
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'Coach payment.pdf'
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setProblem('The PDF could not be made. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant={variant} onClick={download} loading={busy}>
        {busy ? 'Preparing the PDF…' : label}
      </Button>
      {problem && (
        <p className="text-[12.5px] text-danger" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}

