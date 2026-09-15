'use client'

import { useRouter } from 'next/navigation'

/** Which term's fees are on screen. A dropdown, because terms only accumulate. */
export function TermPicker({
  orgSlug,
  current,
  terms,
}: {
  orgSlug: string
  current: string
  terms: { id: string; name: string }[]
}) {
  const router = useRouter()
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Term</span>
      <select
        value={current}
        onChange={(event) => router.push(`/${orgSlug}/fees/collection?term=${event.target.value}`)}
        className="lapis-field h-9 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-[13px] text-text"
      >
        {terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.name}
          </option>
        ))}
      </select>
    </label>
  )
}
