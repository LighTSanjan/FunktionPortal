import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alert, maskEmail } from '@/core/alerts'

describe('security alerts', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.SECURITY_ALERT_FROM = 'Portal Security <security@example.test>'
    process.env.SECURITY_ALERT_EMAILS = 'treasurer@example.test,president@example.test'
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_ALERT_CHAT_ID
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.SECURITY_ALERT_FROM
    delete process.env.SECURITY_ALERT_EMAILS
  })

  it('emails high-risk events once with provider idempotency and masked network details', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }))
    vi.stubGlobal('fetch', request)

    await alert(
      'financial_entry_voided',
      { club: 'test-club', email: 'treasurer@example.test', ip: '203.0.113.42' },
      { eventId: 'void-entry-123' }
    )

    expect(request).toHaveBeenCalledTimes(1)
    const [url, init] = request.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('security-alert:void-entry-123')
    const body = JSON.parse(String(init.body)) as { to: string[]; text: string }
    expect(body.to).toEqual(['treasurer@example.test', 'president@example.test'])
    expect(body.text).toContain(maskEmail('treasurer@example.test'))
    expect(body.text).not.toContain('203.0.113.42')
    expect(body.text).toContain('203.0.113.x')
  })

  it('does not email routine sign-in notifications', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await alert('account_proven', { club: 'test-club', email: 'member@example.test' })
    expect(request).not.toHaveBeenCalled()
  })

  it('never breaks the user action when the email provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')))
    await expect(
      alert('financial_entry_restored', { club: 'test-club', entry: 'entry-failure-case' })
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
