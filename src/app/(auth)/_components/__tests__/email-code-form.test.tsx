import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

import type { CodeState } from '@/actions/auth'

const sendResult = vi.hoisted(() => ({ next: null as null | ((email: string) => CodeState) }))

vi.mock('@/actions/auth', () => ({
  requestEmailCode: vi.fn(async (_state: unknown, data: FormData) => {
    const email = String(data.get('email'))
    return sendResult.next ? sendResult.next(email) : { error: null, sentTo: email }
  }),
  verifyEmailCode: vi.fn(async () => ({ error: null })),
}))

import { EmailCodeForm, OUTLOOK_QUARANTINE_URL } from '../email-code-form'

/** Ask for a code, the way the form does, and land on the code step. */
async function askForCode(email: string, props: Parameters<typeof EmailCodeForm>[0] = {}) {
  render(<EmailCodeForm {...props} />)
  if (!props.fixedEmail) fireEvent.change(screen.getByLabelText(/Email/), { target: { value: email } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
  })
  await screen.findByLabelText(/Code/)
  return screen.getByText('Don’t see the code?').closest('details')!
}

describe('EmailCodeForm, asking again', () => {
  afterEach(() => {
    sendResult.next = null
  })

  it('holds "Send a new code" until Supabase would send another', async () => {
    sendResult.next = (email) => ({ error: null, sentTo: email, retryAt: Date.now() + 45_000 })
    await askForCode('ada@mymail.sutd.edu.sg')
    const resend = screen.getByRole('button', { name: /Send a new code in 4\ds/ })
    expect(resend).toBeDisabled()
  })

  it('lets "Send a new code" go once the wait is over', async () => {
    sendResult.next = (email) => ({ error: null, sentTo: email, retryAt: Date.now() - 1 })
    await askForCode('ada@mymail.sutd.edu.sg')
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled()
  })

  it('keeps the code box up when the hour’s codes are used, and says why instead of "on its way"', async () => {
    sendResult.next = (email) => ({
      error: 'That’s the most codes one address can ask for in an hour. Use the newest one you got, or ask again in 12 minutes.',
      sentTo: email,
      retryAt: Date.now() + 12 * 60_000,
    })
    await askForCode('ada@mymail.sutd.edu.sg')
    expect(screen.getByRole('alert')).toHaveTextContent(/ask again in 12 minutes/)
    expect(screen.queryByText(/a code is on/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Send a new code in 12 min' })).toBeDisabled()
  })
})

describe('EmailCodeForm, when the code does not arrive', () => {
  it('starts closed, so the code box stays the first thing on the screen', async () => {
    const help = await askForCode('ada@mymail.sutd.edu.sg')
    expect(help.open).toBe(false)
  })

  it('opens on hover', async () => {
    const help = await askForCode('ada@mymail.sutd.edu.sg')
    fireEvent.mouseEnter(help)
    expect(help.open).toBe(true)
  })

  it('opens on a click or tap, for phones that cannot hover', async () => {
    const help = await askForCode('ada@mymail.sutd.edu.sg')
    fireEvent.click(screen.getByText('Don’t see the code?'))
    expect(help.open).toBe(true)
  })

  it('sends an SUTD address to Outlook’s quarantine, in a new tab', async () => {
    await askForCode('ada@mymail.sutd.edu.sg')
    const link = screen.getByRole('link', { name: 'Outlook’s quarantine' })
    expect(link).toHaveAttribute('href', OUTLOOK_QUARANTINE_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/Choose Release, or Request release/)).toBeInTheDocument()
  })

  it('tells a Gmail address to check Spam and Promotions, not a quarantine it does not have', async () => {
    await askForCode('ada@gmail.com')
    expect(screen.queryByRole('link', { name: 'Outlook’s quarantine' })).toBeNull()
    expect(screen.getByText(/check Spam and the Promotions tab/)).toBeInTheDocument()
  })

  it('points an SUTD address at a personal email or Google, for codes SUTD blocks outright', async () => {
    await askForCode('ada@mymail.sutd.edu.sg')
    expect(screen.getByText(/SUTD sometimes blocks it outright/)).toHaveTextContent(/personal email instead, or sign in\s+with Google/)
  })

  it('tells a personal Outlook address to check Junk, not SUTD’s quarantine', async () => {
    await askForCode('ada@outlook.com')
    expect(screen.queryByRole('link', { name: 'Outlook’s quarantine' })).toBeNull()
    expect(screen.getByText(/check your Junk or Spam folder/)).toBeInTheDocument()
  })

  it('does not offer another address to somebody proving the one on their account', async () => {
    await askForCode('', { fixedEmail: 'ada@mymail.sutd.edu.sg' })
    expect(screen.getByRole('link', { name: 'Outlook’s quarantine' })).toBeInTheDocument()
    expect(screen.queryByText(/sign in\s+with Google/i)).toBeNull()
  })
})
