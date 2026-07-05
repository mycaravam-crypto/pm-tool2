import nodemailer from 'nodemailer';

// Real delivery when SMTP_HOST is configured; otherwise falls back to logging
// the message, same "stub outbox" spirit as the notifications table itself —
// local dev and CI need no credentials to exercise the notification flows.
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

const FROM = process.env.SMTP_FROM || 'ChronosPM <no-reply@chronospm.local>';

export async function sendEmail({ to, subject, text }) {
  if (!transporter) {
    console.log(
      `[mailer] SMTP not configured — logging instead of sending.\n  to: ${to}\n  subject: ${subject}\n  body: ${text}`,
    );
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, text });
  } catch (err) {
    // A failed send shouldn't break the request that triggered it (the DB write
    // and WebSocket push already happened) — log and move on.
    console.error(`[mailer] failed to send to ${to}:`, err.message);
  }
}
