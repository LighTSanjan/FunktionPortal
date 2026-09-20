import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorFields, logEvent } from '@/core/observability/logger'

describe('structured operational logging', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps useful delivery flags while redacting sensitive fields', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logEvent('info', 'security_alert.processed', {
      emailSent: true,
      telegramSent: false,
      email: 'treasurer@example.test',
      accountNumber: '123456789',
    })

    const record = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(record.emailSent).toBe(true)
    expect(record.telegramSent).toBe(false)
    expect(record.email).toBe('[redacted]')
    expect(record.accountNumber).toBe('[redacted]')
  })

  it('reports error type and code without logging the error message', () => {
    const error = Object.assign(new Error('contains private data'), { code: 'P2002' })
    expect(errorFields(error)).toEqual({ errorType: 'Error', errorCode: 'P2002', errorDigest: undefined })
    expect(JSON.stringify(errorFields(error))).not.toContain('contains private data')
  })
})
