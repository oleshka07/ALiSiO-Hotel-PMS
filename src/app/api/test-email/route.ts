import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get('to');

  if (!to) {
    return NextResponse.json({ error: 'Please provide a "to" email address in the query parameters. Example: /api/test-email?to=your@email.com' }, { status: 400 });
  }

  try {
    await sendEmail({
      to,
      subject: 'ALiSiO Test Email',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #00A3E0;">Test Email</h2>
          <p>This is a test email sent from the ALiSiO-Hotel-PMS system.</p>
          <p>If you received this, the SMTP configuration (EMAIL_CZ_USER, EMAIL_CZ_PASSWORD, etc.) is working correctly!</p>
          <hr />
          <p style="font-size: 12px; color: #666;">Time of send: ${new Date().toISOString()}</p>
        </div>
      `,
    });

    return NextResponse.json({ 
      success: true, 
      message: `Test email successfully sent to ${to}.`,
      config: {
        host: process.env.EMAIL_CZ_SMTP_HOST || 'smtp.seznam.cz',
        port: process.env.EMAIL_CZ_SMTP_PORT || '465',
        user: process.env.EMAIL_CZ_USER ? 'Set ✅' : 'Missing ❌',
        pass: process.env.EMAIL_CZ_PASSWORD ? 'Set ✅' : 'Missing ❌',
      }
    });
  } catch (error: any) {
    console.error('[Test Email] Error sending email:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || String(error),
      config: {
        host: process.env.EMAIL_CZ_SMTP_HOST || 'smtp.seznam.cz',
        port: process.env.EMAIL_CZ_SMTP_PORT || '465',
        user: process.env.EMAIL_CZ_USER ? 'Set ✅' : 'Missing ❌',
        pass: process.env.EMAIL_CZ_PASSWORD ? 'Set ✅' : 'Missing ❌',
      }
    }, { status: 500 });
  }
}
