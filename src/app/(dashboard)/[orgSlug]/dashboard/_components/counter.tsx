'use client'

import * as React from 'react'
import { formatSgd } from '@/modules/coach-claim/money'

export function Counter({
  cents,
  plain,
  className,
  durationMs = 700,
}: {
  /** Value in cents when rendering money. */
  cents?: number
  /** Value when rendering a plain count. */
  plain?: number
  className?: string
  durationMs?: number
}) {
  const target = cents ?? plain ?? 0
  const [value, setValue] = React.useState(target)

  React.useEffect(() => {
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : durationMs

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return (
    <span className={className}>
      {cents !== undefined ? formatSgd(value) : value.toLocaleString('en-SG')}
    </span>
  )
}
