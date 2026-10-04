import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@/actions/auth', () => ({
  requestEmailCode: vi.fn(async (_state: unknown, data: FormData) => ({
    error: null,
    sentTo: String(data.get('email')),
  })),
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

  it('offers Google or Gmail on the sign-in page', async () => {
    await askForCode('ada@mymail.sutd.edu.sg')
    expect(screen.getByText(/Sign in with Google, or use a Gmail address/)).toBeInTheDocument()
  })

  it('does not offer another address to somebody proving the one on their account', async () => {
    await askForCode('', { fixedEmail: 'ada@mymail.sutd.edu.sg' })
    expect(screen.getByRole('link', { name: 'Outlook’s quarantine' })).toBeInTheDocument()
    expect(screen.queryByText(/Sign in with Google/)).toBeNull()
  })
})
