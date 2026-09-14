/**
 * Security and failure alerts, posted to a private Telegram chat.
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
import { Api } from 'grammy'

export type AlertKind =
  | 'account_proven'
  | 'join_refused'
  | 'exco_granted'
  | 'access_changed'
  | 'bank_details_changed'
  | 'signature_replaced'
  | 'throttle_tripped'
  | 'server_error'

const TITLES: Record<AlertKind, string> = {
  account_proven: '🆕 New person signed in',
  join_refused: '🚪 Sign-in from an address not on the list',
  exco_granted: '🔑 Exco access granted',
  access_changed: '👥 Access changed',
  bank_details_changed: '🏦 Coach bank details changed',
  signature_replaced: '✍️ Signature replaced',
  throttle_tripped: '🚦 Sign-in attempts throttled',
  server_error: '💥 Server error',
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(local.length - 2, 6)))}@${domain}`
}

const recent = new Map<string, number>()

export async function alert(kind: AlertKind, details: Record<string, string | number | null | undefined> = {}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID
  if (!token || !chatId) return

  const lines = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const text = key === 'email' ? maskEmail(String(value)) : String(value)
      return `${key}: ${text.slice(0, 300)}`
    })
  const text = [TITLES[kind], ...lines].join('\n')

  // One crash on a busy page is one message, not one per visitor.
  const now = Date.now()
  if ((recent.get(text) ?? 0) > now - 10 * 60 * 1000) return
  recent.set(text, now)
  if (recent.size > 500) recent.clear()

  try {
    await new Api(token, { timeoutSeconds: 3 }).sendMessage(chatId, text, { link_preview_options: { is_disabled: true } })
  } catch (error) {
    // The token is part of the request; never log the request itself.
    console.error('[alerts] Telegram send failed:', error instanceof Error ? error.name : 'unknown')
  }
}
