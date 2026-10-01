'use client'

import { useFormStatus } from 'react-dom'
import { signInAsDemo } from '@/actions/auth'

const PEOPLE = [
  { persona: 'treasurer', name: 'Tess, the treasurer', sees: 'Exco. Fees, coach payments, the roster, settings.' },
  { persona: 'president', name: 'Priya, the president', sees: 'Exco too, for trying anything that needs a second person.' },
  { persona: 'member', name: 'Ada, a member', sees: 'On the roster. Pays for the term and sees her own records.' },
  { persona: 'newcomer', name: 'Someone new', sees: 'Not on the roster yet. Gets the welcome screens, every time.' },
] as const

/** The hosted demo's sign-in: pick a made-up person, no email needed. */
export function DemoSignIn() {
  return (
    <div className="space-y-3">
      {PEOPLE.map((person) => (
        <form key={person.persona} action={signInAsDemo}>
          <input type="hidden" name="persona" value={person.persona} />
          <PersonButton name={person.name} sees={person.sees} />
        </form>
      ))}
    </div>
  )
}

function PersonButton({ name, sees }: { name: string; sees: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="lapis-press lapis-tap block w-full rounded-[var(--radius-md)] border border-border-strong bg-surface px-4 py-3 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="block text-[14.5px] font-medium text-text">{pending ? 'Signing in…' : name}</span>
      <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">{sees}</span>
    </button>
  )
}
