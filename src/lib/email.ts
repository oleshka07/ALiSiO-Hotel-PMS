/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Simple email sender using Email.cz SMTP (nodemailer)
 * Sender: kemp-carlsbad@email.cz
 */
import nodemailer from 'nodemailer';

let transporter: any = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_CZ_SMTP_HOST || 'smtp.seznam.cz',
    port: parseInt(process.env.EMAIL_CZ_SMTP_PORT || '465', 10),
    secure: true,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: {
      user: process.env.EMAIL_CZ_USER || 'kemp-carlsbad@email.cz',
      pass: process.env.EMAIL_CZ_PASSWORD,
    },
  });
  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  const t = getTransporter();
  await t.sendMail({
    from: `"Kemp Carlsbad" <${process.env.EMAIL_CZ_USER || 'kemp-carlsbad@email.cz'}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });
  console.log(`[Email] Sent to ${to}: ${subject}`);
}
