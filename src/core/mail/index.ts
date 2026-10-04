/**
 * The portal's own email, for telling the exco something needs them.
 *
 * Sign-in codes do not come through here: Supabase sends those. This is for
 * the few notices the portal raises itself, sent over SMTP with the club's
 * mail account — on the live site, the same Gmail account the codes come from,
 * with an app password of its own.
 *
 * Configured by SMTP_USER and SMTP_PASS (SMTP_HOST and SMTP_PORT default to
 * Gmail's). Unset, nothing is sent and the portal carries on: a notice that
 * cannot go out is logged, never a request that fails.
 *
 * Plain text only. SUTD's filter quarantined the club's branded sign-in email
 * as phishing, and a notice nobody receives is worse than a plain one.
 */
import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { errorFields, logEvent } from '@/core/observability/logger'

export interface Mail {
  to: string[]
  subject: string
  text: string
}

let transport: Transporter | null = null

function transporter(): Transporter | null {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 465)
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    })
  }
  return transport
}

/** Send it, or log why not. Never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const to = [...new Set(mail.to.filter((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)))]
  if (to.length === 0) return false

  const smtp = transporter()
  if (!smtp) {
    logEvent('warn', 'mail.not_configured', { subject: mail.subject })
    return false
  }

  const from = process.env.MAIL_FROM ?? `FUNKtion Portal <${process.env.SMTP_USER}>`
  // One message to each person: a handful of exco, and nobody's address is
  // shown to the others.
  const sent = await Promise.all(
    to.map((address) =>
      smtp
        .sendMail({ from, to: address, subject: mail.subject, text: mail.text })
        .then(() => true)
        .catch((error) => {
          logEvent('error', 'mail.send_failed', { subject: mail.subject, ...errorFields(error) })
          return false
        })
    )
  )
  return sent.some(Boolean)
}
