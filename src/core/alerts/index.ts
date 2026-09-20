/**
 * Security and failure alerts, posted to a private Telegram chat and, for
 * high-risk events, emailed to the named portal operators.
 *
 * Not the club group — that is for members. This is for whoever looks after
 * the portal: somebody new got in, somebody was made exco, bank details
 * changed, a page crashed. Each is something that should never happen
 * unnoticed, and most are rare enough that a message per event is right.
 *
 * Configured by TELEGRAM_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID. Unset, nothing
 * is sent. An alert never throws and never holds a request up for long: the
 * portal working matters more than the message about it arriving.
 *
 * Messages leave the portal for Telegram's servers, so they carry as little
 * as does the job: addresses are masked, and no amounts, account numbers or
 * student IDs are ever included.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { Api } from 'grammy'
import { errorFields, logEvent } from '@/core/observability/logger'

export type AlertKind =
  | 'account_proven'
  | 'join_refused'
  | 'exco_granted'
  | 'access_changed'
  | 'bank_details_changed'
  | 'signature_replaced'
  | 'organisation_settings_changed'
  | 'financial_document_voided'
  | 'financial_entry_voided'
  | 'financial_entry_restored'
  | 'throttle_tripped'
  | 'server_error'

const TITLES: Record<AlertKind, string> = {
  account_proven: '🆕 New person signed in',
  join_refused: '🚪 Sign-in from an address not on the list',
  exco_granted: '🔑 Exco access granted',
  access_changed: '👥 Access changed',
  bank_details_changed: '🏦 Coach bank details changed',
  signature_replaced: '✍️ Signature replaced',
  organisation_settings_changed: '⚙️ Financial settings changed',
  financial_document_voided: '🧾 Financial document voided',
  financial_entry_voided: '↩️ Register entry voided',
  financial_entry_restored: '↪️ Register entry restored',
  throttle_tripped: '🚦 Sign-in attempts throttled',
  server_error: '💥 Server error',
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(local.length - 2, 6)))}@${domain}`
}

const recent = new Map<string, number>()

const EMAIL_KINDS = new Set<AlertKind>([
  'exco_granted',
  'access_changed',
  'bank_details_changed',
  'signature_replaced',
  'organisation_settings_changed',
  'financial_document_voided',
  'financial_entry_voided',
  'financial_entry_restored',
  'throttle_tripped',
  'server_error',
])

export interface AlertOptions {
  /** Stable identity for provider-side deduplication. */
  eventId?: string
}

function maskIp(value: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value.replace(/\.\d+$/, '.x')
  if (value.includes(':')) return `${value.split(':').slice(0, 4).join(':')}:…`
  return 'unknown'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

function recipients(): string[] {
  return (process.env.SECURITY_ALERT_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
}

async function sendSecurityEmail(kind: AlertKind, text: string, eventId?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.SECURITY_ALERT_FROM
  const to = recipients()
  if (!EMAIL_KINDS.has(kind) || !apiKey || !from || to.length === 0) return false

  const key = (eventId ?? createHash('sha256').update(`${kind}:${text}`).digest('hex')).slice(0, 220)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `security-alert:${key}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject: `[FUNKtion Portal] ${TITLES[kind].replace(/^\S+\s*/, '')}`,
        text,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>${escapeHtml(TITLES[kind])}</h2>${text
          .split('\n')
          .slice(1)
          .map((line) => `<p style="margin:4px 0">${escapeHtml(line)}</p>`)
          .join('')}<p style="color:#666;margin-top:20px">Review the portal audit log for the authoritative record.</p></div>`,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      logEvent('warn', 'security_alert.email_failed', { kind, status: response.status })
      return false
    }
    return true
  } catch (error) {
    logEvent('error', 'security_alert.email_failed', { kind, ...errorFields(error) })
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export async function alert(
  kind: AlertKind,
  details: Record<string, string | number | null | undefined> = {},
  options: AlertOptions = {}
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID

  const lines = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const text = key === 'email' ? maskEmail(String(value)) : key === 'ip' ? maskIp(String(value)) : String(value)
      return `${key}: ${text.slice(0, 300)}`
    })
  const text = [TITLES[kind], ...lines].join('\n')

  // One crash on a busy page is one message, not one per visitor.
  const now = Date.now()
  if ((recent.get(text) ?? 0) > now - 10 * 60 * 1000) {
    logEvent('info', 'security_alert.deduplicated', { kind })
    return
  }
  recent.set(text, now)
  if (recent.size > 500) recent.clear()

  const deliveries = await Promise.all([
    sendSecurityEmail(kind, text, options.eventId),
    token && chatId
      ? new Api(token, { timeoutSeconds: 3 })
          .sendMessage(chatId, text, { link_preview_options: { is_disabled: true } })
          .then(() => true)
          .catch((error) => {
            // The token is part of the request; never log the request itself.
            logEvent('error', 'security_alert.telegram_failed', { kind, ...errorFields(error) })
            return false
          })
      : Promise.resolve(false),
  ])

  logEvent('info', 'security_alert.processed', {
    kind,
    emailSent: deliveries[0],
    telegramSent: deliveries[1],
  })
}
