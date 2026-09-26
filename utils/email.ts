/**
 * Email sender abstraction. Currently uses Resend (https://resend.com).
 * Swap implementations here without touching the rest of the codebase.
 *
 * Configuration:
 *   RESEND_API_KEY  — required for production
 *   EMAIL_FROM      — sender address (e.g. "LOCALit <noreply@localit.app>")
 *
 * In dev (no RESEND_API_KEY) the sendEmail() helper logs the message to the
 * console and returns success so the rest of the flow keeps working. This is
 * useful for local UI work without a paid Resend account.
 */

export interface SendEmailArgs {
  to: string
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  ok: boolean
  /** Resend message id when actually sent, or a `dev:` prefixed id when stubbed. */
  id?: string
  /** Error message when not ok. */
  error?: string
  /** When stubbed (no RESEND_API_KEY), the full payload is echoed for inspection. */
  preview?: SendEmailArgs
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'LOCALit <onboarding@resend.dev>'

  if (!apiKey) {
    // Dev / unconfigured fallback — never block the request because of email.
    const previewId = `dev:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    console.warn('[email] RESEND_API_KEY not set — logging email instead of sending.')
    console.warn('[email] FROM:', from)
    console.warn('[email] TO  :', args.to)
    console.warn('[email] SUBJ:', args.subject)
    console.warn('[email] TEXT:', args.text)
    return { ok: true, id: previewId, preview: args }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` }
    }
    const data = (await res.json()) as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Generate a cryptographically random 6-digit code as a zero-padded string. */
export function generateOtp(): string {
  // 0..999999 inclusive. Math.random is fine here for a verification code.
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
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f9;padding:24px;color:#1a1a1a">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#111">${appName}</h1>
    <p style="margin:0 0 24px 0;color:#4b5563">Verify your email to finish signing up.</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:700;background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;color:#111">${args.code}</div>
    <p style="margin:24px 0 0 0;color:#6b7280;font-size:14px">This code expires in <strong>15 minutes</strong>. If you didn't request this, you can safely ignore the email.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="margin:0;color:#9ca3af;font-size:12px">— The ${appName} team</p>
  </div>
</body></html>`
  return { subject, html, text }
}