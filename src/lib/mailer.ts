import { Resend } from 'resend';

import { env } from './env.ts';

/**
 * Resend-backed mailer. Optional: when RESEND_API_KEY/EMAIL_FROM are unset the app runs without
 * outbound email (no password reset links; email changes apply without a verification round-trip).
 * env.ts enforces that the pair is set together.
 */
export function mailerConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/**
 * Throws when the mailer is unconfigured (gate on mailerConfigured()) or Resend rejects the send.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY and EMAIL_FROM must be set to send email');
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.name}: ${error.message}`);
  }
}
