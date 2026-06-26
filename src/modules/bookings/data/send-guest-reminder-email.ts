import { getDb } from '@core/db';
import { sendEmail } from '@/lib/email';
import { detectLanguage } from '@/app/guest/[token]/translations';

export async function sendGuestReminderEmail(reservationId: string, origin?: string): Promise<boolean> {
  const db = getDb();

  const row = db.prepare(`
    SELECT r.id, r.check_in, r.check_out, r.guest_page_token,
           g.first_name, g.email, g.phone,
           u.name as unit_name,
           p.name as property_name
    FROM reservations r
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN units u ON r.unit_id = u.id
    LEFT JOIN properties p ON r.property_id = p.id
    WHERE r.id = ?
  `).get(reservationId) as any;

  if (!row || !row.email || !row.guest_page_token) {
    return false;
  }

  const lang = detectLanguage(row.phone, null) as 'en' | 'uk' | 'de' | 'cs' | 'pl' | 'nl' | 'fr';
  const tLang = ['uk', 'de', 'cs'].includes(lang) ? lang : 'en';

  const guestName = row.first_name ? row.first_name.trim() : (tLang === 'uk' ? 'Гість' : tLang === 'de' ? 'Gast' : tLang === 'cs' ? 'Host' : 'Guest');
  const propertyName = row.property_name || 'Kemp Carlsbad';
  const appUrl = origin || process.env.NEXT_PUBLIC_APP_URL || 'https://alisio.swipescape.eu';
  
  const guestPageUrl = `${appUrl}/guest/${row.guest_page_token}`;

  const translations = {
    en: {
      subject: `Action Required: Guest Registration for ${propertyName}`,
      title: 'Fast Check-in: Guest Registration',
      greeting: `Hi ${guestName}!<br><br>We are looking forward to welcoming you to <strong>${propertyName}</strong> on <strong>${row.check_in}</strong>. To ensure a fast and smooth check-in process, please register all guests before your arrival.`,
      body2: 'You can easily complete the registration online by clicking the button below. This will save you time at the reception.',
      btnText: 'Register Guests Online →',
      footerText: `If you have any questions, just let us know.<br>Best regards, ${propertyName} Team`
    },
    uk: {
      subject: `Дія: Реєстрація гостей у ${propertyName}`,
      title: 'Швидкий Check-in: Реєстрація гостей',
      greeting: `Привіт, ${guestName}!<br><br>Ми з нетерпінням чекаємо на вас у <strong>${propertyName}</strong> з <strong>${row.check_in}</strong>. Щоб забезпечити швидке заселення, будь ласка, зареєструйте всіх гостей до вашого приїзду.`,
      body2: 'Ви можете легко завершити реєстрацію онлайн, натиснувши кнопку нижче. Це зекономить ваш час на рецепції.',
      btnText: 'Зареєструвати гостей онлайн →',
      footerText: `Якщо у вас є запитання, просто дайте нам знати.<br>З повагою, команда ${propertyName}`
    },
    de: {
      subject: `Aktion erforderlich: Gästeregistrierung für ${propertyName}`,
      title: 'Schneller Check-in: Gästeregistrierung',
      greeting: `Hallo ${guestName}!<br><br>Wir freuen uns darauf, Sie am <strong>${row.check_in}</strong> im <strong>${propertyName}</strong> begrüßen zu dürfen. Um einen schnellen und reibungslosen Check-in zu gewährleisten, registrieren Sie bitte alle Gäste vor Ihrer Ankunft.`,
      body2: 'Sie können die Registrierung ganz einfach online abschließen, indem Sie auf die Schaltfläche unten klicken. Das spart Ihnen Zeit an der Rezeption.',
      btnText: 'Gäste online registrieren →',
      footerText: `Wenn Sie Fragen haben, lassen Sie es uns einfach wissen.<br>Mit freundlichen Grüßen, Ihr ${propertyName} Team`
    },
    cs: {
      subject: `Akce: Registrace hostů pro ${propertyName}`,
      title: 'Rychlý Check-in: Registrace hostů',
      greeting: `Dobrý den ${guestName}!<br><br>Těšíme se na vaši návštěvu v <strong>${propertyName}</strong> dne <strong>${row.check_in}</strong>. Pro zajištění rychlého odbavení prosím zaregistrujte všechny hosty před vaším příjezdem.`,
      body2: 'Registraci můžete snadno dokončit online kliknutím na tlačítko níže. Ušetříte si tak čas na recepci.',
      btnText: 'Registrovat hosty online →',
      footerText: `Pokud máte jakékoli dotazy, dejte nám vědět.<br>S pozdravem, tým ${propertyName}`
    }
  };

  const t = translations[tLang as keyof typeof translations];
  
  const html = `<!DOCTYPE html>
<html lang="${tLang}">
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e;max-width:560px;margin:0 auto;padding:24px;background:#f7f7f9;">
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.04);text-align:center;">
    <div style="font-size:24px;color:#2E6B4F;font-weight:700;margin-bottom:16px;">${t.title}</div>
    
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px;">
      ${t.greeting}
    </p>

    <p style="font-size:15px;line-height:1.5;margin:0 0 24px;">
      ${t.body2}
    </p>

    <div>
      <a href="${guestPageUrl}" style="display:inline-block;background:#2E6B4F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">
        ${t.btnText}
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px;">
    <div style="font-size:13px;color:#777;line-height:1.5;">
      ${t.footerText}
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to: row.email, subject: t.subject, html });
    console.log(`[GuestReminder] Sent to ${row.email} for reservation ${row.id}`);
    return true;
  } catch (err: any) {
    console.error(`[GuestReminder] Failed for ${row.id}:`, err.message);
    return false;
  }
}
