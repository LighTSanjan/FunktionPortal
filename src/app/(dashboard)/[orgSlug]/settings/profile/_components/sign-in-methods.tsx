'use client'

import { useActionState, useState } from 'react'
import { connectGoogle, disconnectGoogle, removeLogin, type ProfileState } from '@/actions/profile'
import { Button } from '@/core/ui/button'

export interface SignInMethodsProps {
  orgSlug: string
  email: string
  /** The Google address connected, or null. */
  google: string | null
  /** Google is the only way in; it can't be taken off. */
  googleOnly: boolean
  /** Holds nothing the club would miss, so it may be removed. */
  removable: boolean
  /** Back from Google: how connecting it went. */
  outcome: 'connected' | 'taken' | 'failed' | null
  /** The demo signs in with a click; there's nothing to connect. */
  demo: boolean
}

const OUTCOME = {
  connected: { tone: 'text-success', text: 'Google is connected. You can sign in with it from now on.' },
  taken: {
    tone: 'text-danger',
    text: 'That Google account already has its own login here. Sign in with Google, open Settings, remove that login, then come back and connect it.',
  },
  failed: { tone: 'text-danger', text: 'Google wasn’t connected. Try again.' },
} as const

export function SignInMethods({ orgSlug, email, google, googleOnly, removable, outcome, demo }: SignInMethodsProps) {
  const [connectState, connect, connecting] = useActionState<ProfileState, FormData>(
    async () => connectGoogle(orgSlug),
    { error: null }
  )
  const [disconnectState, disconnect, disconnecting] = useActionState<ProfileState, FormData>(
    async () => disconnectGoogle(orgSlug),
    { error: null }
  )
  const [removeState, remove, removing] = useActionState<ProfileState, FormData>(
    async () => removeLogin(orgSlug),
    { error: null }
  )
  const [confirming, setConfirming] = useState(false)
  const error = connectState.error ?? disconnectState.error ?? removeState.error

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
        {!googleOnly && (
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="text-[13.5px]">
              Email code <span className="text-text-muted">· {email}</span>
            </span>
          </li>
        )}
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-[13.5px]">
            Google {google ? <span className="text-text-muted">· {google}</span> : <span className="text-text-subtle">· not connected</span>}
          </span>
          {!demo &&
            (google ? (
              !googleOnly && (
                <form action={disconnect}>
                  <Button type="submit" size="sm" variant="ghost" loading={disconnecting}>
                    Disconnect
                  </Button>
                </form>
              )
            ) : (
              <form action={connect}>
                <Button type="submit" size="sm" variant="secondary" loading={connecting}>
                  Connect Google
                </Button>
              </form>
            ))}
        </li>
      </ul>

      {outcome && <p className={`text-[13px] ${OUTCOME[outcome].tone}`}>{OUTCOME[outcome].text}</p>}
      {error && (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}

      {removable && !demo && (
        <div className="border-t border-border pt-4">
          {confirming ? (
            <form action={remove} className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-text">Remove this login? You’ll be signed out.</span>
              <Button type="submit" size="sm" variant="danger" loading={removing}>
                Remove it
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </form>
          ) : (
            <p className="text-[13px] text-text-muted">
              Signed in with the wrong account?{' '}
              <button type="button" onClick={() => setConfirming(true)} className="font-medium text-danger hover:underline">
                Remove this login
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
