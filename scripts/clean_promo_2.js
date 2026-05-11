const fs = require('fs');

const filePaths = [
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/api/widget-activate.handlers.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/api/widget-availability.handlers.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/api/widget-checkout.handlers.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/api/widget-reserve.handlers.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/api/widget-services.handlers.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/ui/BookingV2.tsx',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/ui/translations.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/guest/[token]/page.tsx',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/booking/page.tsx',
];

filePaths.forEach((file) => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content
    .replace(/\blet promo\b/g, 'let offer')
    .replace(/\bconst promo\b/g, 'const offer')
    .replace(/\bpromo\./g, 'offer.')
    .replace(/\bpromo \=/g, 'offer =')
    .replace(/if \(promo\)/g, 'if (offer)')
    .replace(/if \(!promo\)/g, 'if (!offer)')
    .replace(/!promo /g, '!offer ')
    .replace(/promo:/g, 'offer:')
    .replace(/promo \?/g, 'offer ?')
    .replace(/Promo code/gi, 'Coupon code')
    .replace(/Promo error/gi, 'Coupon error')
    .replace(/Invalid promo/gi, 'Invalid coupon')
    .replace(/\/api\/booking\/promo/g, '/api/booking/activate')
    .replace(/Promo /g, 'Coupon ')
    .replace(/promo\b/g, 'offer');
  
  // Undo DB column replacements just in case
  newContent = newContent.replace(/offer_code/g, 'promo_code');
  newContent = newContent.replace(/offer_codes/g, 'promo_codes');

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated promo in:', file);
  }
});
