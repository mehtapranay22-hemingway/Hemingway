import { Resend } from 'resend'

// Transactional email (verification, password reset) via Resend. Configured
// only when RESEND_API_KEY is set — unset locally, sends are skipped with a
// console warning so the rest of the auth flow still works in dev.

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

let client: Resend | null = null

function getResend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

// Until a sending domain is verified on Resend, mail can only go out from
// their shared onboarding@resend.dev address. Set RESEND_FROM_EMAIL once
// hemingwayengine.com is verified there.
function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'Hemingway <onboarding@resend.dev>'
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function wrapEmail(heading: string, body: string, ctaLabel: string, ctaUrl: string): string {
  return `
    <div style="background:#FAF9F6;padding:40px 20px;font-family:Georgia,serif;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E3DD;padding:36px;">
        <p style="font-size:14px;font-weight:700;color:#1A1A1A;letter-spacing:0.05em;margin:0 0 28px;">HEMINGWAY</p>
        <h1 style="font-size:22px;color:#1A1A1A;margin:0 0 12px;">${heading}</h1>
        <p style="font-size:14px;color:#6B6862;line-height:1.6;margin:0 0 28px;">${body}</p>
        <a href="${ctaUrl}" style="display:inline-block;background:#1A1A1A;color:#FAF9F6;text-decoration:none;font-size:14px;font-weight:500;padding:12px 24px;">${ctaLabel}</a>
        <p style="font-size:12px;color:#B0ACA5;line-height:1.6;margin:28px 0 0;">If the button doesn't work, paste this link into your browser:<br/>${ctaUrl}</p>
      </div>
    </div>
  `
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  if (!emailConfigured()) {
    console.warn('[email] RESEND_API_KEY not set — skipping verification email to', email)
    return
  }
  const url = `${appBaseUrl()}/api/auth/verify-email?token=${token}`
  await getResend().emails.send({
    from: fromAddress(),
    to: email,
    subject: 'Verify your Hemingway account',
    html: wrapEmail(
      'Verify your email.',
      'Confirm this is your email address to finish setting up your Hemingway account.',
      'Verify email →',
      url
    ),
  })
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  if (!emailConfigured()) {
    console.warn('[email] RESEND_API_KEY not set — skipping password reset email to', email)
    return
  }
  const url = `${appBaseUrl()}/reset-password?token=${token}`
  await getResend().emails.send({
    from: fromAddress(),
    to: email,
    subject: 'Reset your Hemingway password',
    html: wrapEmail(
      'Reset your password.',
      'We got a request to reset your Hemingway password. This link expires in 1 hour — if you didn\'t request this, you can ignore this email.',
      'Reset password →',
      url
    ),
  })
}
