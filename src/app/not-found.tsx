import { ErrorScene } from '@/core/ui/error-scene'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg px-4">
      <div aria-hidden="true" className="lapis-band -mx-4 h-[7px]" />
      <ErrorScene kind="not-found" />
    </main>
  )
}
