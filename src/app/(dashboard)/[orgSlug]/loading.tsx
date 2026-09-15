import { Skeleton } from '@/core/ui/skeleton'

/**
 * Shown the moment somebody clicks through to another screen, while the
 * server gathers it. Without it a click did nothing visible for seconds —
 * which reads as a broken button, and gets clicked again.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1080px] space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-3 w-80" />
      </div>
      <Skeleton className="h-28 w-full rounded-[var(--radius-md)]" />
      <Skeleton className="h-64 w-full rounded-[var(--radius-md)]" />
    </div>
  )
}
