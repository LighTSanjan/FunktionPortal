'use client'

import { useActionState, useState } from 'react'
import { requestEmailCode, verifyEmailCode, type CodeState } from '@/actions/auth'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { FormField } from '@/core/ui/form-field'
import { emailPlaceholder } from '@/core/brand'

/**
 * Sign in with a code emailed to the address.
 *
 * `fixedEmail` is for somebody already signed in whose address still needs
 * proving: the code goes to the address on their account and nowhere else.
 */
export function EmailCodeForm({ fixedEmail, localMailbox }: { fixedEmail?: string; localMailbox?: string }) {
  const [sendState, send, sending] = useActionState<CodeState, FormData>(requestEmailCode, { error: null })
  const [verifyState, verify, verifying] = useActionState<CodeState, FormData>(verifyEmailCode, { error: null })
  const [changing, setChanging] = useState(false)

  const sentTo = changing ? undefined : sendState.sentTo

  if (!sentTo) {
    return (
      <form action={(data) => { setChanging(false); send(data) }} className="space-y-4">
        {sendState.error && <Alert>{sendState.error}</Alert>}
        {fixedEmail ? (
          <>
            <input type="hidden" name="email" value={fixedEmail} />
            <p className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-[13.5px] text-text-muted">
              We&rsquo;ll send a code to <span className="font-medium text-text">{fixedEmail}</span>.
            </p>
          </>
        ) : (
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={emailPlaceholder()}
              required
              autoComplete="email"
              defaultValue={sendState.sentTo ?? ''}
            />
          </FormField>
        )}
        <Button type="submit" size="lg" className="w-full" loading={sending}>
          Email me a code
        </Button>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-relaxed text-text-muted">
        If <span className="font-medium text-text">{sentTo}</span> can use the portal, a code is on
        its way. It comes from Supabase, so check spam if it is not there in a minute.
      </p>

      {localMailbox && (
        <p className="rounded-[var(--radius-sm)] border border-warning/30 bg-warning/10 p-3 text-[13px] leading-relaxed text-text">
          This is a local copy of the portal: emails do not reach real inboxes. Your code is in the{' '}
          <a href={localMailbox} target="_blank" rel="noreferrer" className="font-medium text-accent-600 underline">
            local mailbox
          </a>
          .
        </p>
      )}

      <form action={verify} className="space-y-4">
        {verifyState.error && <Alert>{verifyState.error}</Alert>}
        <input type="hidden" name="email" value={sentTo} />
        <FormField label="Code" htmlFor="code" required>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,12}"
            maxLength={12}
            placeholder="123456"
            required
            autoFocus
            className="text-center font-mono text-[20px] tracking-[0.3em]"
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={verifying}>
          Sign in
        </Button>
      </form>

      <div className="flex justify-between text-[12.5px]">
        <form action={send}>
          <input type="hidden" name="email" value={sentTo} />
          <button type="submit" className="font-medium text-text-muted underline-offset-4 hover:text-accent-600 hover:underline" disabled={sending}>
            {sending ? 'Sending…' : 'Send a new code'}
          </button>
        </form>
        {!fixedEmail && (
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="font-medium text-text-muted underline-offset-4 hover:text-accent-600 hover:underline"
          >
            Use a different address
          </button>
        )}
      </div>
    </div>
  )
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/8 p-3 text-[13px] text-danger"
      role="alert"
    >
      {children}
    </div>
  )
}
