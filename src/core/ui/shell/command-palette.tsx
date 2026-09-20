'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import type { NavEntry } from '@/core/navigation'
import { cn } from '@/lib/utils'

interface CommandPaletteProps {
  orgSlug: string
  navEntries: NavEntry[]
  open: boolean
  onClose: () => void
}

export function CommandPalette({ orgSlug, navEntries, open, onClose }: CommandPaletteProps) {
  if (!open) return null
  return (
    <CommandPaletteInner
      key={String(open)}
      orgSlug={orgSlug}
      navEntries={navEntries}
      onClose={onClose}
    />
  )
}

function CommandPaletteInner({
  orgSlug,
  navEntries,
  onClose,
}: Omit<CommandPaletteProps, 'open'>) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const returnFocusRef = React.useRef<HTMLElement | null>(null)
  const filtered = React.useMemo(() => {
    const search = query.trim().toLowerCase()
    return search
      ? navEntries.filter((entry) => entry.label.toLowerCase().includes(search))
      : navEntries
  }, [navEntries, query])

  React.useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const timeout = setTimeout(() => inputRef.current?.focus(), 50)
    return () => {
      clearTimeout(timeout)
      returnFocusRef.current?.focus()
    }
  }, [])

  React.useEffect(() => {
    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleDialogKeys)
    return () => document.removeEventListener('keydown', handleDialogKeys)
  }, [onClose])

  function navigate(entry: NavEntry) {
    router.push(`/${orgSlug}${entry.href}`)
    onClose()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && filtered[selectedIndex]) {
      event.preventDefault()
      navigate(filtered[selectedIndex])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent px-2 py-3 text-[14px] text-text outline-none placeholder:text-text-subtle"
            placeholder="Search pages..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            aria-label="Search"
            aria-activedescendant={filtered[selectedIndex] ? `cmd-${selectedIndex}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-text-subtle transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ul id="cmd-list" role="listbox" className="max-h-[300px] overflow-y-auto p-1">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-[13px] text-text-muted">
              No results found.
            </li>
          )}
          {filtered.map((entry, index) => (
            <li
              key={entry.href}
              id={`cmd-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] transition-colors',
                index === selectedIndex
                  ? 'bg-accent-50 text-accent-700'
                  : 'text-text-muted hover:bg-surface-hover'
              )}
              onClick={() => navigate(entry)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="font-medium">{entry.label}</span>
              <span className="ml-auto text-[11px] text-text-subtle">{entry.href}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-[11px] text-text-subtle">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
