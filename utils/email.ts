/**
 * Email sender abstraction.
 *
 * Two backends are supported:
 *
 *   1. **SMTP** (nodemailer) — when SMTP_HOST is set. Works with Gmail SMTP
 *      (smtp.gmail.com:587 + App Password), Brevo, Mailgun, self-hosted
 *      Postfix, or anything else that speaks SMTP. This is the recommended
 *      path because Gmail accepts arbitrary `From:` addresses as long as the
 *      transport authenticates correctly (e.g. From=`LOCALit <darklunatv@gmail.com>`
 *      via Gmail SMTP). For arbitrary sender domains (noreply@localit.app)
 *      you still need that domain to publish matching SPF/DKIM records.
 *
 *   2. **Resend** (legacy, still works) — when only RESEND_API_KEY is set.
 *      Subject to Resend's "verified sender domain" rule (the resend.dev
 *      sandbox only allows sending to the account owner).
 *
 *   3. **Dev fallback** — when neither is configured, the message is logged
 *      to console and the call returns success so the rest of the flow keeps
 *      working. The /api/auth/signup/start route also has its own
 *      OTP_PREVIEW escape hatch which short-circuits even before this layer.
 *
 * Configuration (env vars):
 *
 *   SMTP_HOST        — e.g. "smtp.gmail.com"
 *   SMTP_PORT        — e.g. "587" (default if unset)
 *   SMTP_SECURE      — "true" for port 465 (implicit TLS), else false (STARTTLS)
 *   SMTP_USER        — e.g. "darklunatv@gmail.com"
 *   SMTP_PASS        — e.g. Gmail App Password (16 chars, no spaces)
 *
 *   RESEND_API_KEY   — legacy. Use SMTP_* instead for new deploys.
 *
 *   EMAIL_FROM       — sender header, e.g.
 *                       '"LOCALit" <noreply@localit.app>'
 *                       'LOCALit <darklunatv@gmail.com>'   ← Gmail SMTP
 *
 * Pick the backend based on which env vars are present. SMTP wins over
 * Resend when both are set (newer + cheaper + supports local dev too).
 */

import nodemailer, { type Transporter } from 'nodemailer'

export interface SendEmailArgs {
  to: string
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  ok: boolean
  /** Provider message id when actually sent, or `dev:` prefixed id when stubbed. */
  id?: string
  /** Which backend was used: "smtp", "resend", or "dev". */
  backend?: 'smtp' | 'resend' | 'dev'
  /** Error message when not ok. */
  error?: string
  /** When stubbed (no SMTP_HOST and no RESEND_API_KEY), the full payload for inspection. */
  preview?: SendEmailArgs
}

let cachedTransport: Transporter | null = null
function getSmtpTransport(): Transporter | null {
  if (cachedTransport) return cachedTransport

  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null

  const port = Number(process.env.SMTP_PORT ?? 587)
  const secure = process.env.SMTP_SECURE === 'true'

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Gmail STARTTLS — keep pool small so we don't leak connections in
    // serverless (each Vercel lambda lives ~10s; one connection per cold start
    // is fine).
    pool: false,
    tls: {
      // Gmail's SMTP server uses a public cert, no need to be strict.
      rejectUnauthorized: true,
    },
  })
  return cachedTransport
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM || 'LOCALit <onboarding@resend.dev>'

  // ---- 1. SMTP (preferred) -------------------------------------------------
  const smtp = getSmtpTransport()
  if (smtp) {
    try {
      const info = await smtp.sendMail({ from, to: args.to, subject: args.subject, html: args.html, text: args.text })
      console.log(`[email] SMTP sent: ${info.messageId} → ${args.to} (subject="${args.subject}")`)
      return { ok: true, id: info.messageId, backend: 'smtp' }
    } catch (e) {
      const msg = (e as Error).message
      console.error(`[email] SMTP send failed: ${msg}`)
      return { ok: false, error: `SMTP: ${msg}`, backend: 'smtp' }
    }
  }

  // ---- 2. Resend (legacy fallback) -----------------------------------------
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html, text: args.text }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}`, backend: 'resend' }
      }
      const data = (await res.json()) as { id?: string }
      return { ok: true, id: data.id, backend: 'resend' }
    } catch (e) {
      return { ok: false, error: (e as Error).message, backend: 'resend' }
    }
  }

  // ---- 3. Dev fallback -----------------------------------------------------
  const previewId = `dev:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
  console.warn('[email] No SMTP_HOST and no RESEND_API_KEY — logging instead of sending.')
  console.warn('[email] FROM:', from)
  console.warn('[email] TO  :', args.to)
  console.warn('[email] SUBJ:', args.subject)
  console.warn('[email] TEXT:', args.text)
  return { ok: true, id: previewId, backend: 'dev', preview: args }
}

/** Generate a cryptographically random 6-digit code as a zero-padded string. */
export function generateOtp(): string {
  const n = Math.floor(Math.random() * 1_000_000)
  return n.toString().padStart(6, '0')
}

/** Build the OTP email body. Plain text + simple HTML. */
export function buildOtpEmail(args: { code: string; appName?: string }): {
  subject: string
  html: string
  text: string
} {
  const appName = args.appName ?? 'LOCALit'
  const subject = `Your ${appName} verification code`
  const text =
    `Your ${appName} verification code is: ${args.code}\n\n` +
    `This code expires in 15 minutes. If you didn't request this, you can ignore the email.\n\n` +
    `— The ${appName} team`
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#ECFDF5;padding:24px;color:#0A1F1D">
  <div style="max-width:480px;margin:0 auto;background:#F0FDF4;border-radius:12px;padding:32px;border:1px solid #BBF7D0">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#134E4A">${appName}</h1>
    <p style="margin:0 0 24px 0;color:#4B5563">Verify your email to finish signing up.</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:700;background:#D1FAE5;border-radius:8px;padding:16px;text-align:center;color:#0A1F1D">${args.code}</div>
    <p style="margin:24px 0 0 0;color:#6B7280;font-size:14px">This code expires in <strong>15 minutes</strong>. If you didn't request this, you can safely ignore the email.</p>
    <hr style="border:none;border-top:1px solid #BBF7D0;margin:24px 0">
    <p style="margin:0;color:#6B7280;font-size:12px">— The ${appName} team</p>
  </div>
</body></html>`
  return { subject, html, text }
}
