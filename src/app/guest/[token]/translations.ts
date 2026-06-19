/* eslint-disable @typescript-eslint/no-explicit-any */
// ─── Guest Page v3 Translations ───────────────────
// Languages: EN, DE, CS, UK, PL, NL, FR

export type Lang = 'en' | 'de' | 'cs' | 'uk' | 'pl' | 'nl' | 'fr';

export const LANG_LABELS: Record<Lang, string> = {
  en: 'EN', de: 'DE', cs: 'CZ', uk: 'UA', pl: 'PL', nl: 'NL', fr: 'FR',
};

export const LANG_FLAGS: Record<Lang, string> = {
  en: '🇬🇧', de: '🇩🇪', cs: '🇨🇿', uk: '🇺🇦', pl: '🇵🇱', nl: '🇳🇱', fr: '🇧🇪',
};

export interface Translations {
  // Tabs
  home: string;
  services: string;
  explore: string;
  chat: string;
  // Booking card
  checkIn: string;
  checkOut: string;
  nights: string;
  // Stage messages
  daysToGo: (n: number) => string;
  todayIsTheDay: string;
  enjoyDay: (n: number) => string;
  checkoutToday: string;
  // Sections
  gettingReady: string;
  yourStay: string;
  beforeYouLeave: string;
  goodToKnow: string;
  yourCabin: string;
  houseRules: string;
  // Action card
  completeReg: string;
  regMinutes: string;
  startReg: string;
  // List rows
  bookingConfirmed: string;
  guestReg: string;
  required: string;
  done: string;
  regComplete: string;
  entryInstructions: string;
  howToGetHere: string;
  // Checkout checklist
  closeWindows: string;
  keyInLockbox: string;
  lateCheckout: string;
  // Good to know
  checkInTime: string;
  checkOutTime: string;
  wifiLabel: string;
  tapToCopy: string;
  pets: string;
  petsWelcome: string;
  support: string;
  // Stories
  directions: string;
  entry: string;
  wifi: string;
  parking: string;
  restaurant: string;
  hiking: string;
  // Sheets
  howToGetHereTitle: string;
  entryTitle: string;
  wifiTitle: string;
  chatTitle: string;
  // Directions sheet
  address: string;
  gps: string;
  parkingInfo: string;
  videoGuide: string;
  openGoogleMaps: string;
  // Wi-Fi sheet
  network: string;
  password: string;
  copyPassword: string;
  copied: string;
  // Entry sheet
  entryStep1: string;
  entryStep2: string;
  entryStep3Code: string;
  entryStep4: string;
  lateArrival: string;
  yourAccommodation: string;
  // Services tab
  servicesTitle: string;
  servicesSubtitle: string;
  addToStay: string;
  per: string;
  viewMenu: string;
  // Explore tab
  exploreTitle: string;
  exploreSubtitle: string;
  navigate: string;
  viewRoutes: string;
  // Chat
  typePlaceholder: string;
  chatWelcome: (name: string) => string;
  // Registration
  regTitle: string;
  stepOf: (current: number, total: number) => string;
  back: string;
  continue_: string;
  confirmReg: string;
  // Step 1
  step1Title: string;
  fullName: string;
  email: string;
  phone: string;
  phoneHint: string;
  dateOfBirth: string;
  // Step 2
  step2Title: string;
  step2Why: string;
  securityNotice: string;
  documentType: string;
  selectDoc: string;
  passportDoc: string;
  idCardDoc: string;
  drivingLicenseDoc: string;
  documentNumber: string;
  nationality: string;
  permanentAddress: string;
  purposeOfStay: string;
  visaNumber: string;
  guest: string;
  // Step 3
  step3Title: string;
  confirmNotice: string;
  // Feedback
  feedbackTitle: string;
  feedbackQuestion: string;
  feedbackPlaceholder: string;
  send: string;
  // Weather
  greatDay: string;
  // Errors
  notFound: string;
  notFoundDesc: string;
  loading: string;
  regSaved: string;
  regError: string;
  serviceOrdered: string;
  orderError: string;
  // Pets policy
  petsNotAllowed: string;
  petsWithFee: string;
  // Parking
  parkingTitle: string;
  parkingFree: string;
  // FAQ
  faqTitle: string;
  // Empty states
  noServices: string;
  noExplore: string;
  // Post-stay
  thankYou: (name: string) => string;
  thankYouStay: string;
  comeBack: string;
  earlyBooking: string;
  earlyBookingDesc: string;
  discount: string;
  adultsShort: string;
  childrenShort: string;
  ourAccommodations: string;
  selectAccommodation: string;
  footerLocation: string;
  // Payment Gate
  paymentRequired: string;
  completePayment: string;
  availableAfterPayment: string;
  remainingAmount: string;
  bookingPaidConfirmed: string;
  // Far Before
  farBeforeTitle: string;
  registerBeforeCheckin: string;
  // Cart
  addToCart: string;
  payNow: string;
  yourCart: string;
  payAll: (total: string) => string;
  cartEmpty: string;
  browseServices: string;
  inCart: string;
  addedToCart: string;
  removeFromCart: string;
  cartItems: (n: number) => string;
  // Cart line subtitles (slot/breakfast)
  hour: string;
  hours: string;
  dishes: string;
  daysShort: string;
  // My Orders
  myOrders: string;
  ordersTitle: string;
  awaitingPayment: string;
  orderRefunded: string;
}

const translations: Record<Lang, Translations> = {
  // ════════════════ ENGLISH ════════════════
  en: {
    home: 'Home', services: 'Services', explore: 'Explore', chat: 'Chat',
    checkIn: 'CHECK-IN', checkOut: 'CHECK-OUT', nights: 'NIGHTS',
    daysToGo: (n) => `🗓 ${n} day${n === 1 ? '' : 's'} to go`,
    todayIsTheDay: '🌟 Today is the day!',
    enjoyDay: (n) => `🌿 Day ${n} — enjoy the forest`,
    checkoutToday: '👋 Check-out today',
    gettingReady: 'Getting ready', yourStay: 'Your stay', beforeYouLeave: 'Before you leave',
    goodToKnow: 'Good to know', yourCabin: 'Your cabin', houseRules: 'House rules',
    completeReg: 'Complete registration', regMinutes: '2 minutes · required before check-in', startReg: 'Start →',
    bookingConfirmed: 'Booking confirmed', guestReg: 'Guest registration',
    required: 'Required', done: 'Done', regComplete: 'Registration complete',
    entryInstructions: 'Entry instructions', howToGetHere: 'How to get here',
    closeWindows: 'Close windows & lights', keyInLockbox: 'Key in the lockbox', lateCheckout: 'Late check-out until 14:00',
    checkInTime: 'Check-in', checkOutTime: 'Check-out', wifiLabel: 'Wi-Fi', tapToCopy: 'Tap to copy',
    pets: 'Pets', petsWelcome: 'Welcome', support: 'Support',
    directions: 'Directions', entry: 'Entry', wifi: 'Wi-Fi', parking: 'Parking', restaurant: 'Restaurant', hiking: 'Hiking',
    howToGetHereTitle: 'How to get here', entryTitle: 'Entry instructions', wifiTitle: 'Wi-Fi', chatTitle: 'Chat with us',
    address: 'Address', gps: 'GPS', parkingInfo: 'Parking', videoGuide: '🎥 Watch the last 500m video guide so you know exactly where to turn',
    openGoogleMaps: 'Open in Google Maps',
    network: 'Network', password: 'Password', copyPassword: 'Copy Password', copied: 'Copied!',
    entryStep1: 'Walk to your cabin (follow signs)', entryStep2: 'Lockbox is on the right side of the door',
    entryStep3Code: 'Code:', entryStep4: 'Turn the key left to open',
    lateArrival: '🌙 Arriving after dark? Pathway lights turn on automatically at sunset.',
    yourAccommodation: 'Your accommodation',
    servicesTitle: 'Services', servicesSubtitle: 'Add something special to your stay',
    addToStay: 'Add to My Stay', per: 'per', viewMenu: 'View Menu →',
    exploreTitle: 'Explore', exploreSubtitle: 'Discover what\'s around you',
    navigate: 'Navigate', viewRoutes: 'View routes',
    typePlaceholder: 'Type a message...', chatWelcome: (name) => `Hi ${name}! Welcome to Kemp Carlsbad. Let us know if you need anything 🌿`,
    regTitle: 'Guest Registration', stepOf: (c, t) => `Step ${c} of ${t}`, back: '← Back', continue_: 'Continue →', confirmReg: 'Confirm Registration ✓',
    step1Title: 'Guest Details', fullName: 'Full name', email: 'Email', phone: 'Phone', phoneHint: 'Only for check-in day contact',
    dateOfBirth: 'Date of birth',
    step2Title: 'ID Document', step2Why: 'Required by Czech law for all accommodation guests',
    securityNotice: '🔒 Your data is stored securely and used only for mandatory guest registration',
    documentType: 'Document type', selectDoc: 'Select...', passportDoc: 'Passport', idCardDoc: 'National ID', drivingLicenseDoc: 'Driving licence',
    documentNumber: 'Document number', nationality: 'Nationality', permanentAddress: 'Permanent address', purposeOfStay: 'Purpose of stay', visaNumber: 'Visa number (if applicable)', guest: 'Guest',
    step3Title: 'Confirm', confirmNotice: '✅ That\'s it! After confirming, you\'ll receive check-in instructions.',
    feedbackTitle: '💚 How was your stay?', feedbackQuestion: 'What\'s the one thing you\'ll remember?',
    feedbackPlaceholder: 'The campfire under the stars...', send: 'Send',
    greatDay: 'Great day for the river trail 🌲',
    notFound: 'Booking not found', notFoundDesc: 'Please check the link you received.', loading: 'Loading...',
    regSaved: 'Registration saved!', regError: 'Please fill in all required fields.', serviceOrdered: 'Service ordered!', orderError: 'Error ordering service.',
    petsNotAllowed: 'Not allowed', petsWithFee: 'With fee',
    parkingTitle: 'Parking', parkingFree: 'Free parking at the entrance',
    faqTitle: 'FAQ', noServices: 'No additional services available at this time.', noExplore: 'Explore information will appear closer to your stay.',
    thankYou: (n) => `Thank you, ${n}!`, thankYouStay: 'We hope you enjoyed your stay', comeBack: 'Come back soon!',
    earlyBooking: 'Early Booking', earlyBookingDesc: 'Book your next stay at a special rate.',
    discount: 'discount', adultsShort: 'ad.', childrenShort: 'ch.', ourAccommodations: 'Our accommodations',
    selectAccommodation: 'Select', footerLocation: 'Loketská, Karlovy Vary, Czech Republic',
    paymentRequired: 'Complete payment to unlock full access',
    completePayment: 'Complete payment →',
    availableAfterPayment: 'Available after payment',
    remainingAmount: 'Remaining to pay',
    bookingPaidConfirmed: 'Booking confirmed & paid',
    farBeforeTitle: 'See you soon!',
    registerBeforeCheckin: 'Please complete your registration before check-in',
    addToCart: 'Add to cart',
    payNow: 'Pay now',
    yourCart: 'Your cart',
    payAll: (total: string) => `Pay all — ${total}`,
    cartEmpty: 'Your cart is empty',
    browseServices: 'Browse services',
    inCart: 'In cart ✓',
    addedToCart: 'Added to cart ✓',
    removeFromCart: 'Remove',
    cartItems: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
    hour: 'h', hours: 'h', dishes: 'dishes', daysShort: 'd',
    myOrders: 'My Orders', ordersTitle: 'Your services', awaitingPayment: '⏳ Awaiting payment', orderRefunded: '↩️ Refunded',

  },

  // ════════════════ DEUTSCH ════════════════
  de: {
    home: 'Home', services: 'Services', explore: 'Entdecken', chat: 'Chat',
    checkIn: 'CHECK-IN', checkOut: 'CHECK-OUT', nights: 'NÄCHTE',
    daysToGo: (n) => `🗓 Noch ${n} Tag${n === 1 ? '' : 'e'}`,
    todayIsTheDay: '🌟 Heute ist der Tag!',
    enjoyDay: (n) => `🌿 Tag ${n} — genieß den Wald`,
    checkoutToday: '👋 Abreise heute',
    gettingReady: 'Vorbereitung', yourStay: 'Ihr Aufenthalt', beforeYouLeave: 'Vor der Abreise',
    goodToKnow: 'Gut zu wissen', yourCabin: 'Ihre Unterkunft', houseRules: 'Hausordnung',
    completeReg: 'Registrierung abschließen', regMinutes: '2 Minuten · vor Check-in erforderlich', startReg: 'Starten →',
    bookingConfirmed: 'Buchung bestätigt', guestReg: 'Gästeregistrierung',
    required: 'Erforderlich', done: 'Erledigt', regComplete: 'Registrierung abgeschlossen',
    entryInstructions: 'Zugangsanweisungen', howToGetHere: 'Anfahrt',
    closeWindows: 'Fenster & Lichter schließen', keyInLockbox: 'Schlüssel in die Schlüsselbox', lateCheckout: 'Später Check-out bis 14:00',
    checkInTime: 'Check-in', checkOutTime: 'Check-out', wifiLabel: 'WLAN', tapToCopy: 'Tippen zum Kopieren',
    pets: 'Haustiere', petsWelcome: 'Willkommen', support: 'Support',
    directions: 'Anfahrt', entry: 'Zugang', wifi: 'WLAN', parking: 'Parken', restaurant: 'Restaurant', hiking: 'Wandern',
    howToGetHereTitle: 'Anfahrt', entryTitle: 'Zugangsanweisungen', wifiTitle: 'WLAN', chatTitle: 'Uns schreiben',
    address: 'Adresse', gps: 'GPS', parkingInfo: 'Parken', videoGuide: '🎥 Video-Guide für die letzten 500m',
    openGoogleMaps: 'In Google Maps öffnen',
    network: 'Netzwerk', password: 'Passwort', copyPassword: 'Passwort kopieren', copied: 'Kopiert!',
    entryStep1: 'Gehen Sie zu Ihrer Kabine (Schilder folgen)', entryStep2: 'Schlüsselbox rechts neben der Tür',
    entryStep3Code: 'Code:', entryStep4: 'Schlüssel nach links drehen zum Öffnen',
    lateArrival: '🌙 Nachts anreisen? Wegbeleuchtung schaltet sich automatisch ein.',
    yourAccommodation: 'Ihre Unterkunft',
    servicesTitle: 'Services', servicesSubtitle: 'Etwas Besonderes für Ihren Aufenthalt',
    addToStay: 'Zum Aufenthalt hinzufügen', per: 'pro', viewMenu: 'Menü ansehen →',
    exploreTitle: 'Entdecken', exploreSubtitle: 'Entdecken Sie die Umgebung',
    navigate: 'Navigation', viewRoutes: 'Routen ansehen',
    typePlaceholder: 'Nachricht eingeben...', chatWelcome: (name) => `Hallo ${name}! Willkommen im Kemp Carlsbad. Lassen Sie uns wissen, wenn Sie etwas brauchen 🌿`,
    regTitle: 'Gästeregistrierung', stepOf: (c, t) => `Schritt ${c} von ${t}`, back: '← Zurück', continue_: 'Weiter →', confirmReg: 'Registrierung bestätigen ✓',
    step1Title: 'Gästedaten', fullName: 'Vollständiger Name', email: 'E-Mail', phone: 'Telefon', phoneHint: 'Nur für Kontakt am Check-in-Tag',
    dateOfBirth: 'Geburtsdatum',
    step2Title: 'Ausweis', step2Why: 'Gesetzlich vorgeschrieben für alle Unterkunftsgäste in Tschechien',
    securityNotice: '🔒 Ihre Daten werden sicher gespeichert und nur für die Pflichtregistrierung verwendet',
    documentType: 'Dokumenttyp', selectDoc: 'Auswählen...', passportDoc: 'Reisepass', idCardDoc: 'Personalausweis', drivingLicenseDoc: 'Führerschein',
    documentNumber: 'Dokumentnummer', nationality: 'Nationalität', permanentAddress: 'Ständige Adresse', purposeOfStay: 'Reisezweck', visaNumber: 'Visumnummer (falls zutreffend)', guest: 'Gast',
    step3Title: 'Bestätigen', confirmNotice: '✅ Das war\'s! Nach der Bestätigung erhalten Sie die Check-in-Anweisungen.',
    feedbackTitle: '💚 Wie war Ihr Aufenthalt?', feedbackQuestion: 'Was werden Sie am meisten in Erinnerung behalten?',
    feedbackPlaceholder: 'Das Lagerfeuer unter den Sternen...', send: 'Senden',
    greatDay: 'Perfekter Tag für den Flusswanderweg 🌲',
    notFound: 'Buchung nicht gefunden', notFoundDesc: 'Bitte überprüfen Sie den erhaltenen Link.', loading: 'Laden...',
    regSaved: 'Registrierung gespeichert!', regError: 'Bitte füllen Sie alle Pflichtfelder aus.', serviceOrdered: 'Service bestellt!', orderError: 'Fehler bei der Bestellung.',
    petsNotAllowed: 'Nicht erlaubt', petsWithFee: 'Mit Gebühr',
    parkingTitle: 'Parken', parkingFree: 'Kostenloser Parkplatz am Eingang',
    faqTitle: 'FAQ', noServices: 'Derzeit sind keine zusätzlichen Services verfügbar.', noExplore: 'Informationen zur Umgebung erscheinen kurz vor Ihrem Aufenthalt.',
    thankYou: (n) => `Danke, ${n}!`, thankYouStay: 'Wir hoffen, Sie hatten einen tollen Aufenthalt', comeBack: 'Bis bald!',
    earlyBooking: 'Frühbucher', earlyBookingDesc: 'Buchen Sie Ihren nächsten Aufenthalt zum Sonderpreis.',
    discount: 'Rabatt', adultsShort: 'Erw.', childrenShort: 'Ki.', ourAccommodations: 'Unsere Unterkünfte',
    selectAccommodation: 'Auswählen', footerLocation: 'Loketská, Karlovy Vary, Tschechien',
    paymentRequired: 'Schließen Sie die Zahlung ab, um vollen Zugang zu erhalten',
    completePayment: 'Zahlung abschließen →',
    availableAfterPayment: 'Verfügbar nach Zahlung',
    remainingAmount: 'Ausstehender Betrag',
    bookingPaidConfirmed: 'Buchung bestätigt & bezahlt',
    farBeforeTitle: 'Bis bald!',
    registerBeforeCheckin: 'Bitte schließen Sie die Registrierung vor dem Check-in ab',
    addToCart: 'In den Warenkorb',
    payNow: 'Jetzt bezahlen',
    yourCart: 'Ihr Warenkorb',
    payAll: (total: string) => `Alles bezahlen — ${total}`,
    cartEmpty: 'Ihr Warenkorb ist leer',
    browseServices: 'Zum Angebot',
    inCart: 'Im Warenkorb ✓',
    addedToCart: 'Zum Warenkorb hinzugefügt ✓',
    removeFromCart: 'Entfernen',
    cartItems: (n: number) => `${n} ${n === 1 ? 'Artikel' : 'Artikel'}`,
    hour: 'h', hours: 'h', dishes: 'Speisen', daysShort: 'T',
    myOrders: 'Meine Bestellungen', ordersTitle: 'Ihre Dienste', awaitingPayment: '⏳ Zahlung ausstehend', orderRefunded: '↩️ Zurückgezahlt',

  },

  // ════════════════ ČEŠTINA ════════════════
  cs: {
    home: 'Domů', services: 'Služby', explore: 'Okolí', chat: 'Chat',
    checkIn: 'CHECK-IN', checkOut: 'CHECK-OUT', nights: 'NOCÍ',
    daysToGo: (n) => `🗓 ${n} ${n === 1 ? 'den' : n < 5 ? 'dny' : 'dní'} do příjezdu`,
    todayIsTheDay: '🌟 Dnes je ten den!',
    enjoyDay: (n) => `🌿 Den ${n} — užijte si les`,
    checkoutToday: '👋 Odjezd dnes',
    gettingReady: 'Příprava', yourStay: 'Váš pobyt', beforeYouLeave: 'Před odjezdem',
    goodToKnow: 'Dobré vědět', yourCabin: 'Vaše ubytování', houseRules: 'Domovní řád',
    completeReg: 'Dokončit registraci', regMinutes: '2 minuty · povinné před check-inem', startReg: 'Začít →',
    bookingConfirmed: 'Rezervace potvrzena', guestReg: 'Registrace hostů',
    required: 'Povinné', done: 'Hotovo', regComplete: 'Registrace dokončena',
    entryInstructions: 'Pokyny pro vstup', howToGetHere: 'Jak se dostat',
    closeWindows: 'Zavřít okna a světla', keyInLockbox: 'Klíč do schránky', lateCheckout: 'Pozdní check-out do 14:00',
    checkInTime: 'Check-in', checkOutTime: 'Check-out', wifiLabel: 'Wi-Fi', tapToCopy: 'Klepněte pro kopírování',
    pets: 'Mazlíčci', petsWelcome: 'Vítáni', support: 'Podpora',
    directions: 'Navigace', entry: 'Vstup', wifi: 'Wi-Fi', parking: 'Parkování', restaurant: 'Restaurace', hiking: 'Výlety',
    howToGetHereTitle: 'Jak se dostat', entryTitle: 'Pokyny pro vstup', wifiTitle: 'Wi-Fi', chatTitle: 'Napište nám',
    address: 'Adresa', gps: 'GPS', parkingInfo: 'Parkování', videoGuide: '🎥 Video průvodce posledních 500m',
    openGoogleMaps: 'Otevřít v Google Maps',
    network: 'Síť', password: 'Heslo', copyPassword: 'Kopírovat heslo', copied: 'Zkopírováno!',
    entryStep1: 'Jděte ke své chatě (sledujte značky)', entryStep2: 'Schránka na klíče je vpravo od dveří',
    entryStep3Code: 'Kód:', entryStep4: 'Otočte klíčem doleva',
    lateArrival: '🌙 Přijíždíte po setmění? Osvětlení cest se zapíná automaticky.',
    yourAccommodation: 'Vaše ubytování',
    servicesTitle: 'Služby', servicesSubtitle: 'Přidejte něco speciálního k pobytu',
    addToStay: 'Přidat k pobytu', per: 'za', viewMenu: 'Zobrazit menu →',
    exploreTitle: 'Okolí', exploreSubtitle: 'Objevte, co je kolem vás',
    navigate: 'Navigovat', viewRoutes: 'Zobrazit trasy',
    typePlaceholder: 'Napište zprávu...', chatWelcome: (name) => `Ahoj ${name}! Vítejte v Kempu Carlsbad. Dejte nám vědět, pokud cokoliv potřebujete 🌿`,
    regTitle: 'Registrace hostů', stepOf: (c, t) => `Krok ${c} z ${t}`, back: '← Zpět', continue_: 'Pokračovat →', confirmReg: 'Potvrdit registraci ✓',
    step1Title: 'Údaje hosta', fullName: 'Celé jméno', email: 'E-mail', phone: 'Telefon', phoneHint: 'Pouze pro kontakt v den příjezdu',
    dateOfBirth: 'Datum narození',
    step2Title: 'Doklad totožnosti', step2Why: 'Vyžadováno českým zákonem pro všechny ubytované hosty',
    securityNotice: '🔒 Vaše data jsou uložena bezpečně a použita pouze pro povinnou registraci',
    documentType: 'Typ dokladu', selectDoc: 'Vyberte...', passportDoc: 'Cestovní pas', idCardDoc: 'Občanský průkaz', drivingLicenseDoc: 'Řidičský průkaz',
    documentNumber: 'Číslo dokladu', nationality: 'Národnost', permanentAddress: 'Trvalé bydliště', purposeOfStay: 'Účel pobytu', visaNumber: 'Číslo víza (pokud se vás týká)', guest: 'Host',
    step3Title: 'Potvrzení', confirmNotice: '✅ To je vše! Po potvrzení obdržíte pokyny k check-inu.',
    feedbackTitle: '💚 Jak se vám líbilo?', feedbackQuestion: 'Na co budete nejvíc vzpomínat?',
    feedbackPlaceholder: 'Oheň pod hvězdami...', send: 'Odeslat',
    greatDay: 'Skvělý den na říční stezku 🌲',
    notFound: 'Rezervace nenalezena', notFoundDesc: 'Zkontrolujte prosím odkaz.', loading: 'Načítání...',
    regSaved: 'Registrace uložena!', regError: 'Prosím vyplňte všechna povinná pole.', serviceOrdered: 'Služba objednána!', orderError: 'Chyba při objednání.',
    petsNotAllowed: 'Nepovoleno', petsWithFee: 'S poplatkem',
    parkingTitle: 'Parkování', parkingFree: 'Bezplatné parkování u vchodu',
    faqTitle: 'Časté dotazy', noServices: 'Žádné další služby nejsou momentálně k dispozici.', noExplore: 'Informace o okolí se objeví blíže k vašemu pobytu.',
    thankYou: (n) => `Děkujeme, ${n}!`, thankYouStay: 'Doufáme, že jste si pobyt užili', comeBack: 'Příště se těšíme!',
    earlyBooking: 'Předčasná rezervace', earlyBookingDesc: 'Zarezervujte si další pobyt za zvýhodněnou cenu.',
    discount: 'sleva', adultsShort: 'dosp.', childrenShort: 'dětí', ourAccommodations: 'Naše ubytování',
    selectAccommodation: 'Vybrat', footerLocation: 'Loketská, Karlovy Vary, Česko',
    paymentRequired: 'Dokončete platbu pro plný přístup',
    completePayment: 'Dokončit platbu →',
    availableAfterPayment: 'Dostupné po platbě',
    remainingAmount: 'Zbývá uhradit',
    bookingPaidConfirmed: 'Rezervace potvrzena a zaplacena',
    farBeforeTitle: 'Brzy na viděnou!',
    registerBeforeCheckin: 'Prosíme dokončete registraci před příjezdem',
    addToCart: 'Přidat do košíku',
    payNow: 'Zaplatit nyní',
    yourCart: 'Váš košík',
    payAll: (total: string) => `Zaplatit vše — ${total}`,
    cartEmpty: 'Váš košík je prázdný',
    browseServices: 'Procházet služby',
    inCart: 'V košíku ✓',
    addedToCart: 'Přidáno do košíku ✓',
    removeFromCart: 'Odebrat',
    cartItems: (n: number) => `${n} ${n === 1 ? 'položka' : n < 5 ? 'položky' : 'položek'}`,
    hour: 'h', hours: 'h', dishes: 'jídel', daysShort: 'd',
    myOrders: 'Moje objednávky', ordersTitle: 'Vaše služby', awaitingPayment: '⏳ Čeká na platbu', orderRefunded: '↩️ Vráceno',

  },

  // ════════════════ УКРАЇНСЬКА ════════════════
  uk: {
    home: 'Головна', services: 'Послуги', explore: 'Околиці', chat: 'Чат',
    checkIn: 'ЗАЇЗД', checkOut: 'ВИЇЗД', nights: 'НОЧЕЙ',
    daysToGo: (n) => `🗓 ${n} ${n === 1 ? 'день' : n < 5 ? 'дні' : 'днів'} до заїзду`,
    todayIsTheDay: '🌟 Сьогодні той самий день!',
    enjoyDay: (n) => `🌿 День ${n} — насолоджуйтесь лісом`,
    checkoutToday: '👋 Виїзд сьогодні',
    gettingReady: 'Підготовка', yourStay: 'Ваше перебування', beforeYouLeave: 'Перед від\'їздом',
    goodToKnow: 'Корисне', yourCabin: 'Ваше помешкання', houseRules: 'Правила',
    completeReg: 'Завершити реєстрацію', regMinutes: '2 хвилини · обов\'язково перед заїздом', startReg: 'Почати →',
    bookingConfirmed: 'Бронювання підтверджено', guestReg: 'Реєстрація гостей',
    required: 'Обов\'язково', done: 'Готово', regComplete: 'Реєстрацію завершено',
    entryInstructions: 'Як потрапити', howToGetHere: 'Як дістатися',
    closeWindows: 'Закрийте вікна та світло', keyInLockbox: 'Ключ у скриньку', lateCheckout: 'Пізній виїзд до 14:00',
    checkInTime: 'Заїзд', checkOutTime: 'Виїзд', wifiLabel: 'Wi-Fi', tapToCopy: 'Натисніть щоб скопіювати',
    pets: 'Тварини', petsWelcome: 'Раді бачити', support: 'Підтримка',
    directions: 'Дорога', entry: 'Вхід', wifi: 'Wi-Fi', parking: 'Парковка', restaurant: 'Ресторан', hiking: 'Прогулянки',
    howToGetHereTitle: 'Як дістатися', entryTitle: 'Інструкція зі входу', wifiTitle: 'Wi-Fi', chatTitle: 'Напишіть нам',
    address: 'Адреса', gps: 'GPS', parkingInfo: 'Парковка', videoGuide: '🎥 Відео-гід останніх 500м, щоб знати де повертати',
    openGoogleMaps: 'Відкрити в Google Maps',
    network: 'Мережа', password: 'Пароль', copyPassword: 'Копіювати пароль', copied: 'Скопійовано!',
    entryStep1: 'Йдіть до своєї кабіни (за вказівниками)', entryStep2: 'Скринька з ключем — праворуч від дверей',
    entryStep3Code: 'Код:', entryStep4: 'Поверніть ключ вліво',
    lateArrival: '🌙 Приїжджаєте після заходу сонця? Освітлення доріжок вмикається автоматично.',
    yourAccommodation: 'Ваше помешкання',
    servicesTitle: 'Послуги', servicesSubtitle: 'Додайте щось особливе до перебування',
    addToStay: 'Додати до перебування', per: 'за', viewMenu: 'Меню →',
    exploreTitle: 'Околиці', exploreSubtitle: 'Відкрийте для себе, що навколо',
    navigate: 'Навігація', viewRoutes: 'Маршрути',
    typePlaceholder: 'Напишіть повідомлення...', chatWelcome: (name) => `Привіт, ${name}! Ласкаво просимо до Кемп Карлсбад. Пишіть, якщо щось потрібно 🌿`,
    regTitle: 'Реєстрація гостей', stepOf: (c, t) => `Крок ${c} з ${t}`, back: '← Назад', continue_: 'Далі →', confirmReg: 'Підтвердити реєстрацію ✓',
    step1Title: 'Дані гостя', fullName: 'Повне ім\'я', email: 'Email', phone: 'Телефон', phoneHint: 'Тільки для зв\'язку в день заїзду',
    dateOfBirth: 'Дата народження',
    step2Title: 'Документ', step2Why: 'Вимагається чеським законодавством для всіх гостей',
    securityNotice: '🔒 Ваші дані зберігаються безпечно і використовуються лише для обов\'язкової реєстрації',
    documentType: 'Тип документа', selectDoc: 'Оберіть...', passportDoc: 'Паспорт', idCardDoc: 'ID-картка', drivingLicenseDoc: 'Водійське посвідчення',
    documentNumber: 'Номер документа', nationality: 'Громадянство', permanentAddress: 'Адреса проживання', purposeOfStay: 'Мета поїздки', visaNumber: 'Номер візи (якщо є)', guest: 'Гість',
    step3Title: 'Підтвердження', confirmNotice: '✅ Це все! Після підтвердження ви отримаєте інструкції для заїзду.',
    feedbackTitle: '💚 Як вам сподобалося?', feedbackQuestion: 'Що запам\'яталось найбільше?',
    feedbackPlaceholder: 'Вогнище під зірками...', send: 'Надіслати',
    greatDay: 'Чудовий день для прогулянки біля річки 🌲',
    notFound: 'Бронювання не знайдено', notFoundDesc: 'Перевірте посилання.', loading: 'Завантаження...',
    regSaved: 'Реєстрацію збережено!', regError: 'Будь ласка, заповніть всі обов\'язкові поля.', serviceOrdered: 'Послугу замовлено!', orderError: 'Помилка замовлення.',
    petsNotAllowed: 'Не дозволено', petsWithFee: 'З доплатою',
    parkingTitle: 'Парковка', parkingFree: 'Безкоштовна парковка біля входу',
    faqTitle: 'Часті питання', noServices: 'Наразі додаткові послуги недоступні.', noExplore: 'Інформація про околиці з\'явиться ближче до перебування.',
    thankYou: (n) => `Дякуємо, ${n}!`, thankYouStay: 'Сподіваємось, вам сподобалось', comeBack: 'Чекаємо знову!',
    earlyBooking: 'Раннє бронювання', earlyBookingDesc: 'Забронюйте наступне перебування за спеціальною ціною.',
    discount: 'знижка', adultsShort: 'дор.', childrenShort: 'діт.', ourAccommodations: 'Наші помешкання',
    selectAccommodation: 'Обрати', footerLocation: 'Loketská, Карлові Вари, Чехія',
    paymentRequired: 'Завершіть оплату для повного доступу',
    completePayment: 'Завершити оплату →',
    availableAfterPayment: 'Доступно після оплати',
    remainingAmount: 'Залишок до оплати',
    bookingPaidConfirmed: 'Бронювання підтверджено та оплачено',
    farBeforeTitle: 'До зустрічі!',
    registerBeforeCheckin: 'Будь ласка, завершіть реєстрацію перед заїздом',
    addToCart: 'Додати в кошик',
    payNow: 'Оплатити зараз',
    yourCart: 'Ваш кошик',
    payAll: (total: string) => `Оплатити все — ${total}`,
    cartEmpty: 'Ваш кошик порожній',
    browseServices: 'Переглянути послуги',
    inCart: 'У кошику ✓',
    addedToCart: 'Додано в кошик ✓',
    removeFromCart: 'Видалити',
    cartItems: (n: number) => `${n} ${n === 1 ? 'товар' : n < 5 ? 'товари' : 'товарів'}`,
    hour: 'год', hours: 'год', dishes: 'страв', daysShort: 'дн',
    myOrders: 'Мої замовлення', ordersTitle: 'Ваші послуги', awaitingPayment: '⏳ Очікує оплати', orderRefunded: '↩️ Повернено',

  },

  // ════════════════ POLSKI ════════════════
  pl: {
    home: 'Główna', services: 'Usługi', explore: 'Odkrywaj', chat: 'Chat',
    checkIn: 'ZAMELDOWANIE', checkOut: 'WYMELDOWANIE', nights: 'NOCY',
    daysToGo: (n) => `🗓 ${n} ${n === 1 ? 'dzień' : n < 5 ? 'dni' : 'dni'} do przyjazdu`,
    todayIsTheDay: '🌟 To ten dzień!',
    enjoyDay: (n) => `🌿 Dzień ${n} — ciesz się lasem`,
    checkoutToday: '👋 Wymeldowanie dzisiaj',
    gettingReady: 'Przygotowania', yourStay: 'Twój pobyt', beforeYouLeave: 'Przed wyjazdem',
    goodToKnow: 'Warto wiedzieć', yourCabin: 'Twoje zakwaterowanie', houseRules: 'Regulamin',
    completeReg: 'Dokończ rejestrację', regMinutes: '2 minuty · wymagane przed zameldowaniem', startReg: 'Start →',
    bookingConfirmed: 'Rezerwacja potwierdzona', guestReg: 'Rejestracja gości',
    required: 'Wymagane', done: 'Gotowe', regComplete: 'Rejestracja zakończona',
    entryInstructions: 'Instrukcje wejścia', howToGetHere: 'Jak dojechać',
    closeWindows: 'Zamknij okna i światła', keyInLockbox: 'Klucz do skrzynki', lateCheckout: 'Późne wymeldowanie do 14:00',
    checkInTime: 'Zameldowanie', checkOutTime: 'Wymeldowanie', wifiLabel: 'Wi-Fi', tapToCopy: 'Dotknij aby skopiować',
    pets: 'Zwierzęta', petsWelcome: 'Mile widziane', support: 'Wsparcie',
    directions: 'Dojazd', entry: 'Wejście', wifi: 'Wi-Fi', parking: 'Parking', restaurant: 'Restauracja', hiking: 'Wędrówki',
    howToGetHereTitle: 'Jak dojechać', entryTitle: 'Instrukcje wejścia', wifiTitle: 'Wi-Fi', chatTitle: 'Napisz do nas',
    address: 'Adres', gps: 'GPS', parkingInfo: 'Parking', videoGuide: '🎥 Film z ostatnich 500m drogi',
    openGoogleMaps: 'Otwórz w Google Maps',
    network: 'Sieć', password: 'Hasło', copyPassword: 'Kopiuj hasło', copied: 'Skopiowano!',
    entryStep1: 'Idź do swojej chatki (podążaj za znakami)', entryStep2: 'Skrzynka na klucze po prawej stronie drzwi',
    entryStep3Code: 'Kod:', entryStep4: 'Obróć klucz w lewo',
    lateArrival: '🌙 Przyjeżdżasz po zmroku? Oświetlenie ścieżek włącza się automatycznie.',
    yourAccommodation: 'Twoje zakwaterowanie',
    servicesTitle: 'Usługi', servicesSubtitle: 'Dodaj coś szczególnego do pobytu',
    addToStay: 'Dodaj do pobytu', per: 'za', viewMenu: 'Zobacz menu →',
    exploreTitle: 'Odkrywaj', exploreSubtitle: 'Odkryj co jest wokół ciebie',
    navigate: 'Nawiguj', viewRoutes: 'Zobacz trasy',
    typePlaceholder: 'Napisz wiadomość...', chatWelcome: (name) => `Cześć ${name}! Witamy w Kemp Carlsbad. Daj znać, jeśli czegoś potrzebujesz 🌿`,
    regTitle: 'Rejestracja gości', stepOf: (c, t) => `Krok ${c} z ${t}`, back: '← Wstecz', continue_: 'Dalej →', confirmReg: 'Potwierdź rejestrację ✓',
    step1Title: 'Dane gościa', fullName: 'Imię i nazwisko', email: 'E-mail', phone: 'Telefon', phoneHint: 'Tylko do kontaktu w dniu przyjazdu',
    dateOfBirth: 'Data urodzenia',
    step2Title: 'Dokument tożsamości', step2Why: 'Wymagane czeskim prawem dla wszystkich gości',
    securityNotice: '🔒 Dane są przechowywane bezpiecznie i używane wyłącznie do obowiązkowej rejestracji',
    documentType: 'Typ dokumentu', selectDoc: 'Wybierz...', passportDoc: 'Paszport', idCardDoc: 'Dowód osobisty', drivingLicenseDoc: 'Prawo jazdy',
    documentNumber: 'Numer dokumentu', nationality: 'Narodowość', permanentAddress: 'Adres zamieszkania', purposeOfStay: 'Cel podróży', visaNumber: 'Numer wizy (jeśli dotyczy)', guest: 'Gość',
    step3Title: 'Potwierdzenie', confirmNotice: '✅ To wszystko! Po potwierdzeniu otrzymasz instrukcje zameldowania.',
    feedbackTitle: '💚 Jak się podobało?', feedbackQuestion: 'Co zapamiętasz najbardziej?',
    feedbackPlaceholder: 'Ognisko pod gwiazdami...', send: 'Wyślij',
    greatDay: 'Świetny dzień na szlak nad rzeką 🌲',
    notFound: 'Nie znaleziono rezerwacji', notFoundDesc: 'Sprawdź link.', loading: 'Ładowanie...',
    regSaved: 'Rejestracja zapisana!', regError: 'Proszę wypełnić wszystkie wymagane pola.', serviceOrdered: 'Usługa zamówiona!', orderError: 'Błąd zamówienia.',
    petsNotAllowed: 'Niedozwolone', petsWithFee: 'Z opłatą',
    parkingTitle: 'Parking', parkingFree: 'Bezpłatny parking przy wjeździe',
    faqTitle: 'FAQ', noServices: 'Brak dodatkowych usług w tym momencie.', noExplore: 'Informacje o okolicy pojawią się bliżej pobytu.',
    thankYou: (n) => `Dziękujemy, ${n}!`, thankYouStay: 'Mamy nadzieję, że pobyt się podobał', comeBack: 'Wracajcie!',
    earlyBooking: 'Wczesna rezerwacja', earlyBookingDesc: 'Zarezerwuj kolejny pobyt w specjalnej cenie.',
    discount: 'zniżka', adultsShort: 'dos.', childrenShort: 'dz.', ourAccommodations: 'Nasze zakwaterowanie',
    selectAccommodation: 'Wybierz', footerLocation: 'Loketská, Karlovy Vary, Czechy',
    paymentRequired: 'Dokończ płatność, aby uzyskać pełny dostęp',
    completePayment: 'Dokończ płatność →',
    availableAfterPayment: 'Dostępne po płatności',
    remainingAmount: 'Pozostało do zapłaty',
    bookingPaidConfirmed: 'Rezerwacja potwierdzona i opłacona',
    farBeforeTitle: 'Do zobaczenia!',
    registerBeforeCheckin: 'Prosimy o wypełnienie rejestracji przed przyjazdem',
    addToCart: 'Dodaj do koszyka',
    payNow: 'Zapłać teraz',
    yourCart: 'Twój koszyk',
    payAll: (total: string) => `Zapłać wszystko — ${total}`,
    cartEmpty: 'Twój koszyk jest pusty',
    browseServices: 'Przeglądaj usługi',
    inCart: 'W koszyku ✓',
    addedToCart: 'Dodano do koszyka ✓',
    removeFromCart: 'Usuń',
    cartItems: (n: number) => `${n} ${n === 1 ? 'element' : 'elementy'}`,
    hour: 'h', hours: 'h', dishes: 'dań', daysShort: 'd',
    myOrders: 'Moje zamówienia', ordersTitle: 'Twoje usługi', awaitingPayment: '⏳ Oczekuje na płatność', orderRefunded: '↩️ Zwrócono',

  },

  // ════════════════ NEDERLANDS ════════════════
  nl: {
    home: 'Home', services: 'Diensten', explore: 'Ontdek', chat: 'Chat',
    checkIn: 'CHECK-IN', checkOut: 'CHECK-OUT', nights: 'NACHTEN',
    daysToGo: (n) => `🗓 Nog ${n} dag${n === 1 ? '' : 'en'}`,
    todayIsTheDay: '🌟 Vandaag is de dag!',
    enjoyDay: (n) => `🌿 Dag ${n} — geniet van het bos`,
    checkoutToday: '👋 Uitchecken vandaag',
    gettingReady: 'Voorbereiden', yourStay: 'Uw verblijf', beforeYouLeave: 'Voor vertrek',
    goodToKnow: 'Goed om te weten', yourCabin: 'Uw accommodatie', houseRules: 'Huisregels',
    completeReg: 'Registratie voltooien', regMinutes: '2 minuten · vereist voor check-in', startReg: 'Start →',
    bookingConfirmed: 'Boeking bevestigd', guestReg: 'Gastregistratie',
    required: 'Verplicht', done: 'Klaar', regComplete: 'Registratie voltooid',
    entryInstructions: 'Toegangsinstructies', howToGetHere: 'Routebeschrijving',
    closeWindows: 'Ramen en lichten sluiten', keyInLockbox: 'Sleutel in de kluis', lateCheckout: 'Laat uitchecken tot 14:00',
    checkInTime: 'Check-in', checkOutTime: 'Check-out', wifiLabel: 'Wi-Fi', tapToCopy: 'Tik om te kopiëren',
    pets: 'Huisdieren', petsWelcome: 'Welkom', support: 'Support',
    directions: 'Route', entry: 'Toegang', wifi: 'Wi-Fi', parking: 'Parkeren', restaurant: 'Restaurant', hiking: 'Wandelen',
    howToGetHereTitle: 'Routebeschrijving', entryTitle: 'Toegangsinstructies', wifiTitle: 'Wi-Fi', chatTitle: 'Stuur ons een bericht',
    address: 'Adres', gps: 'GPS', parkingInfo: 'Parkeren', videoGuide: '🎥 Video voor de laatste 500m',
    openGoogleMaps: 'Openen in Google Maps',
    network: 'Netwerk', password: 'Wachtwoord', copyPassword: 'Wachtwoord kopiëren', copied: 'Gekopieerd!',
    entryStep1: 'Loop naar uw cabin (volg de borden)', entryStep2: 'Sleutelkastje rechts naast de deur',
    entryStep3Code: 'Code:', entryStep4: 'Draai de sleutel naar links',
    lateArrival: '🌙 Komt u na zonsondergang? Padverlichting gaat automatisch aan.',
    yourAccommodation: 'Uw accommodatie',
    servicesTitle: 'Diensten', servicesSubtitle: 'Voeg iets bijzonders toe aan uw verblijf',
    addToStay: 'Toevoegen', per: 'per', viewMenu: 'Menu bekijken →',
    exploreTitle: 'Ontdek', exploreSubtitle: 'Ontdek wat er om u heen is',
    navigate: 'Navigeren', viewRoutes: 'Routes bekijken',
    typePlaceholder: 'Typ een bericht...', chatWelcome: (name) => `Hallo ${name}! Welkom bij Kemp Carlsbad. Laat het ons weten als u iets nodig hebt 🌿`,
    regTitle: 'Gastregistratie', stepOf: (c, t) => `Stap ${c} van ${t}`, back: '← Terug', continue_: 'Verder →', confirmReg: 'Registratie bevestigen ✓',
    step1Title: 'Gastgegevens', fullName: 'Volledige naam', email: 'E-mail', phone: 'Telefoon', phoneHint: 'Alleen voor contact op de dag van aankomst',
    dateOfBirth: 'Geboortedatum',
    step2Title: 'Identiteitsbewijs', step2Why: 'Vereist door de Tsjechische wet voor alle gasten',
    securityNotice: '🔒 Uw gegevens worden veilig opgeslagen en alleen gebruikt voor verplichte registratie',
    documentType: 'Documenttype', selectDoc: 'Selecteer...', passportDoc: 'Paspoort', idCardDoc: 'ID-kaart', drivingLicenseDoc: 'Rijbewijs',
    documentNumber: 'Documentnummer', nationality: 'Nationaliteit', permanentAddress: 'Vast adres', purposeOfStay: 'Doel van het verblijf', visaNumber: 'Visumnummer (indien van toepassing)', guest: 'Gast',
    step3Title: 'Bevestigen', confirmNotice: '✅ Dat is het! Na bevestiging ontvangt u de check-in instructies.',
    feedbackTitle: '💚 Hoe was uw verblijf?', feedbackQuestion: 'Wat zult u het meest onthouden?',
    feedbackPlaceholder: 'Het kampvuur onder de sterren...', send: 'Verzenden',
    greatDay: 'Mooie dag voor het rivierpad 🌲',
    notFound: 'Boeking niet gevonden', notFoundDesc: 'Controleer de link.', loading: 'Laden...',
    regSaved: 'Registratie opgeslagen!', regError: 'Vul alle verplichte velden in.', serviceOrdered: 'Dienst besteld!', orderError: 'Fout bij bestelling.',
    petsNotAllowed: 'Niet toegestaan', petsWithFee: 'Met toeslag',
    parkingTitle: 'Parkeren', parkingFree: 'Gratis parkeren bij de ingang',
    faqTitle: 'FAQ', noServices: 'Op dit moment geen extra diensten beschikbaar.', noExplore: 'Omgevingsinformatie verschijnt dichter bij uw verblijf.',
    thankYou: (n) => `Bedankt, ${n}!`, thankYouStay: 'We hopen dat u heeft genoten', comeBack: 'Tot snel!',
    earlyBooking: 'Vroegboeken', earlyBookingDesc: 'Boek uw volgende verblijf tegen een speciaal tarief.',
    discount: 'korting', adultsShort: 'vol.', childrenShort: 'ki.', ourAccommodations: 'Onze accommodaties',
    selectAccommodation: 'Selecteren', footerLocation: 'Loketská, Karlovy Vary, Tsjechië',
    paymentRequired: 'Voltooi betaling voor volledige toegang',
    completePayment: 'Betaling voltooien →',
    availableAfterPayment: 'Beschikbaar na betaling',
    remainingAmount: 'Resterende betaling',
    bookingPaidConfirmed: 'Boeking bevestigd & betaald',
    farBeforeTitle: 'Tot snel!',
    registerBeforeCheckin: 'Vul de registratie in voor aankomst',
    addToCart: 'Aan winkelwagen toevoegen',
    payNow: 'Nu betalen',
    yourCart: 'Uw winkelwagen',
    payAll: (total: string) => `Alles betalen — ${total}`,
    cartEmpty: 'Uw winkelwagen is leeg',
    browseServices: 'Bekijk diensten',
    inCart: 'In winkelwagen ✓',
    addedToCart: 'Toegevoegd aan winkelwagen ✓',
    removeFromCart: 'Verwijderen',
    cartItems: (n: number) => `${n} ${n === 1 ? 'artikel' : 'artikelen'}`,
    hour: 'u', hours: 'u', dishes: 'gerechten', daysShort: 'd',
    myOrders: 'Mijn bestellingen', ordersTitle: 'Uw diensten', awaitingPayment: '⏳ Wacht op betaling', orderRefunded: '↩️ Terugbetaald',

  },

  // ════════════════ FRANÇAIS (BE) ════════════════
  fr: {
    home: 'Accueil', services: 'Services', explore: 'Explorer', chat: 'Chat',
    checkIn: 'ARRIVÉE', checkOut: 'DÉPART', nights: 'NUITS',
    daysToGo: (n) => `🗓 ${n} jour${n === 1 ? '' : 's'} avant l'arrivée`,
    todayIsTheDay: '🌟 C\'est le grand jour !',
    enjoyDay: (n) => `🌿 Jour ${n} — profitez de la forêt`,
    checkoutToday: '👋 Départ aujourd\'hui',
    gettingReady: 'Préparation', yourStay: 'Votre séjour', beforeYouLeave: 'Avant le départ',
    goodToKnow: 'Bon à savoir', yourCabin: 'Votre hébergement', houseRules: 'Règlement',
    completeReg: 'Terminer l\'enregistrement', regMinutes: '2 minutes · obligatoire avant l\'arrivée', startReg: 'Commencer →',
    bookingConfirmed: 'Réservation confirmée', guestReg: 'Enregistrement des hôtes',
    required: 'Obligatoire', done: 'Fait', regComplete: 'Enregistrement terminé',
    entryInstructions: 'Instructions d\'entrée', howToGetHere: 'Comment s\'y rendre',
    closeWindows: 'Fermer fenêtres et lumières', keyInLockbox: 'Clé dans le coffre', lateCheckout: 'Départ tardif jusqu\'à 14h',
    checkInTime: 'Arrivée', checkOutTime: 'Départ', wifiLabel: 'Wi-Fi', tapToCopy: 'Appuyez pour copier',
    pets: 'Animaux', petsWelcome: 'Bienvenus', support: 'Support',
    directions: 'Itinéraire', entry: 'Entrée', wifi: 'Wi-Fi', parking: 'Parking', restaurant: 'Restaurant', hiking: 'Randonnée',
    howToGetHereTitle: 'Comment s\'y rendre', entryTitle: 'Instructions d\'entrée', wifiTitle: 'Wi-Fi', chatTitle: 'Écrivez-nous',
    address: 'Adresse', gps: 'GPS', parkingInfo: 'Parking', videoGuide: '🎥 Vidéo des derniers 500m',
    openGoogleMaps: 'Ouvrir dans Google Maps',
    network: 'Réseau', password: 'Mot de passe', copyPassword: 'Copier le mot de passe', copied: 'Copié !',
    entryStep1: 'Dirigez-vous vers votre chalet (suivez les panneaux)', entryStep2: 'Boîte à clé à droite de la porte',
    entryStep3Code: 'Code :', entryStep4: 'Tournez la clé à gauche',
    lateArrival: '🌙 Arrivée de nuit ? L\'éclairage des chemins s\'active automatiquement.',
    yourAccommodation: 'Votre hébergement',
    servicesTitle: 'Services', servicesSubtitle: 'Ajoutez quelque chose de spécial à votre séjour',
    addToStay: 'Ajouter au séjour', per: 'par', viewMenu: 'Voir le menu →',
    exploreTitle: 'Explorer', exploreSubtitle: 'Découvrez ce qu\'il y a autour de vous',
    navigate: 'Naviguer', viewRoutes: 'Voir les itinéraires',
    typePlaceholder: 'Tapez un message...', chatWelcome: (name) => `Bonjour ${name} ! Bienvenue au Kemp Carlsbad. N'hésitez pas si vous avez besoin de quoi que ce soit 🌿`,
    regTitle: 'Enregistrement', stepOf: (c, t) => `Étape ${c} sur ${t}`, back: '← Retour', continue_: 'Continuer →', confirmReg: 'Confirmer l\'enregistrement ✓',
    step1Title: 'Détails de l\'hôte', fullName: 'Nom complet', email: 'E-mail', phone: 'Téléphone', phoneHint: 'Uniquement pour le contact le jour d\'arrivée',
    dateOfBirth: 'Date de naissance',
    step2Title: 'Pièce d\'identité', step2Why: 'Exigé par la loi tchèque pour tous les hôtes',
    securityNotice: '🔒 Vos données sont stockées en sécurité et utilisées uniquement pour l\'enregistrement obligatoire',
    documentType: 'Type de document', selectDoc: 'Sélectionnez...', passportDoc: 'Passeport', idCardDoc: 'Carte d\'identité', drivingLicenseDoc: 'Permis de conduire',
    documentNumber: 'Numéro de document', nationality: 'Nationalité', permanentAddress: 'Adresse permanente', purposeOfStay: 'But du séjour', visaNumber: 'Numéro de visa (le cas échéant)', guest: 'Invité',
    step3Title: 'Confirmation', confirmNotice: '✅ C\'est tout ! Après confirmation, vous recevrez les instructions d\'arrivée.',
    feedbackTitle: '💚 Comment était votre séjour ?', feedbackQuestion: 'Quel sera votre meilleur souvenir ?',
    feedbackPlaceholder: 'Le feu de camp sous les étoiles...', send: 'Envoyer',
    greatDay: 'Belle journée pour le sentier de la rivière 🌲',
    notFound: 'Réservation introuvable', notFoundDesc: 'Vérifiez le lien reçu.', loading: 'Chargement...',
    regSaved: 'Enregistrement sauvegardé !', regError: 'Veuillez remplir tous les champs obligatoires.', serviceOrdered: 'Service commandé !', orderError: 'Erreur de commande.',
    petsNotAllowed: 'Non autorisés', petsWithFee: 'Avec supplément',
    parkingTitle: 'Parking', parkingFree: 'Parking gratuit à l\'entrée',
    faqTitle: 'FAQ', noServices: 'Aucun service supplémentaire disponible pour le moment.', noExplore: 'Les informations sur les environs apparaîtront plus près de votre séjour.',
    thankYou: (n) => `Merci, ${n} !`, thankYouStay: 'Nous espérons que vous avez passé un bon séjour', comeBack: 'À bientôt !',
    earlyBooking: 'Réservation anticipée', earlyBookingDesc: 'Réservez votre prochain séjour à un tarif spécial.',
    discount: 'réduction', adultsShort: 'ad.', childrenShort: 'enf.', ourAccommodations: 'Nos hébergements',
    selectAccommodation: 'Sélectionner', footerLocation: 'Loketská, Karlovy Vary, République tchèque',
    paymentRequired: 'Finalisez le paiement pour accès complet',
    completePayment: 'Finaliser le paiement →',
    availableAfterPayment: 'Disponible après paiement',
    remainingAmount: 'Reste à payer',
    bookingPaidConfirmed: 'Réservation confirmée et payée',
    farBeforeTitle: 'À bientôt!',
    registerBeforeCheckin: "Veuillez compléter l'inscription avant votre arrivée",
    addToCart: 'Ajouter au panier',
    payNow: 'Payer maintenant',
    yourCart: 'Votre panier',
    payAll: (total: string) => `Tout payer — ${total}`,
    cartEmpty: 'Votre panier est vide',
    browseServices: 'Voir les services',
    inCart: 'Dans le panier ✓',
    addedToCart: 'Ajouté au panier ✓',
    removeFromCart: 'Supprimer',
    cartItems: (n: number) => `${n} ${n === 1 ? 'article' : 'articles'}`,
    hour: 'h', hours: 'h', dishes: 'plats', daysShort: 'j',
    myOrders: 'Mes commandes', ordersTitle: 'Vos services', awaitingPayment: '⏳ En attente de paiement', orderRefunded: '↩️ Remboursé',

  },
};

export function getTranslations(lang: Lang): Translations {
  return translations[lang] || translations.en;
}

export function detectLanguage(phone?: string | null, country?: string | null): Lang {
  if (phone) {
    if (phone.startsWith('+49')) return 'de';
    if (phone.startsWith('+420')) return 'cs';
    if (phone.startsWith('+380')) return 'uk';
    if (phone.startsWith('+48')) return 'pl';
    if (phone.startsWith('+31') || phone.startsWith('+32')) return phone.startsWith('+32') ? 'fr' : 'nl';
    if (phone.startsWith('+33')) return 'fr';
  }
  if (country) {
    const c = country.toLowerCase();
    if (c.includes('czech') || c.includes('česk')) return 'cs';
    if (c.includes('german') || c.includes('deutsch')) return 'de';
    if (c.includes('ukrain') || c.includes('україн')) return 'uk';
    if (c.includes('pols') || c.includes('polish')) return 'pl';
    if (c.includes('neder') || c.includes('dutch') || c.includes('belgi')) return 'nl';
    if (c.includes('franc') || c.includes('french') || c.includes('belge')) return 'fr';
  }
  return 'en';
}

export function getBrandName(categoryType: string): string {
  return categoryType === 'glamping' ? 'QA Glamping' : 'Kemp Carlsbad';
}

export function formatDateLocalized(dateStr: string, lang: Lang): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const localeMap: Record<Lang, string> = { en: 'en-GB', de: 'de-DE', cs: 'cs-CZ', uk: 'uk-UA', pl: 'pl-PL', nl: 'nl-NL', fr: 'fr-BE' };
    return d.toLocaleDateString(localeMap[lang], { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

export function formatPriceLocalized(amount: number, currency?: string): string {
  const cur = currency || 'CZK';
  try {
    return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(amount);
  } catch { return `${amount} ${cur}`; }
}
