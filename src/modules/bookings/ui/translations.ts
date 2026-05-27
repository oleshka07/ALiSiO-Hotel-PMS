/* eslint-disable @typescript-eslint/no-explicit-any */
// ─── Booking Form Translations (UK, EN, CS, DE) ─────────────

export type BookingLang = 'uk' | 'en' | 'cs' | 'de';

export const BOOKING_LANG_LABELS: Record<BookingLang, string> = {
  uk: 'Українська',
  en: 'English',
  cs: 'Čeština',
  de: 'Deutsch',
};

export const BOOKING_LANG_FLAGS: Record<BookingLang, string> = {
  uk: '🇺🇦',
  en: '🇬🇧',
  cs: '🇨🇿',
  de: '🇩🇪',
};

export interface BookingTranslations {
  // Header
  brandName: string;
  back: string;
  next: string;
  // Steps
  selectDates: string;
  checkInCheckOutDesc: string;
  notSelected: string;
  checkIn: string;
  checkOut: string;
  nightsShort: string;
  adults: string;
  children: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  step5: string;
  monthNames: string[];
  dayNamesShort: string[];
  dates: string;
  selectCheckIn: string;
  selectCheckOut: string;
  couponCode: string;
  apply: string;
  certificateCode: string;
  // Step 2
  selectAccommodation: string;
  availableForDates: string;
  noUnitsFound: string;
  multiHouseInfo: string;
  totalFor: string;
  guests: string;
  petFriendly: string;
  petFriendlyDesc: string;
  petCheckbox: string;
  stubPricing: string;
  addHouse: string;
  selectedHouse: string;
  amenitiesTitle: string;
  adultsCount: string;
  childrenCount: string;
  petPresence: string;
  closeCard: string;
  bookHouse: string;
  noAvailability: string;
  noAvailabilityDesc: string;
  housePlaceholder: string;
  // Step 3
  guestInfoTitle: string;
  confirmationEmailNote: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  agreeTerms: string;
  payAndConfirm: string;
  // Step 4
  addToStayTitle: string;
  everythingOptional: string;
  skipLink: string;
  bookingConfirmedTitle: string;
  bookingConfirmedDesc: string;
  saunaTitle: string;
  saunaPersons: string;
  saunaMinHours: string;
  saunaDesc: string;
  saunaPerHour: string;
  saunaAddToBooking: string;
  editService: string;
  removeService: string;
  saunaDate: string;
  selectTime: string;
  saunaHours: string;
  saunaBroom: string;
  totalLabel: string;
  closePopup: string;
  bookService: string;
  myDishes: string;
  tubTitle: string;
  breakfastTitle: string;
  lateCheckoutTitle: string;
  earlyCheckinTitle: string;
  // Step 5
  paymentTitle: string;
  paymentSubtitle: string;
  securePaymentNote: string;
  additionalServices: string;
  total: string;
  payNow: string;
  processing: string;
  including: string;
  extraPersonCharge: string;
  redirectingToPayment: string;
  paymentFailed: string;
  paymentFailedDesc: string;
  tryAgain: string;
  paymentSuccess: string;
  paymentSuccessDesc: string;
  // Step 6
  bookedSuccess: string;
  bookingSuccess: string;
  bookingSuccessDesc: string;
  bookingNumber: string;
  bookingId: string;
  accommodation: string;
  houseName: string;
  nights: string;
  discount: string;
  serviceTotal: string;
  weWillContact: string;
  purchasedServicesTitle: string;
  backToStart: string;
  supportContactNote: string;
  finishBooking: string;
  poweredBy: string;
  // CTA
  guestsShort: string;
  // Error / messages
  errorOccurred: string;
  offerApplied: string;
  // Step 2 extras
  yourChoice: string;
  yourHouse: string;
  bookingDetails: string;
  // Step 4 extras
  breakfastInfo: string;
  wantButton: string;
  servicesEmpty: string;
  tubDesc: string;
  tubPerHour: string;
  tubAddToBooking: string;
  lateCheckoutDesc: string;
  earlyCheckinDesc: string;
  skipToThankYou: string;
  confirmServices: string;
  // Additional (for V3 and others)
  checkInShort: string;
  checkOutShort: string;
  yourSelection: string;
  night: string;
  youSelected?: string;
  checkDetailsBelow?: string;
  from?: string;
  to?: string;
  duration?: string;
  nightsWord: (n: number) => string;
  packagePrefix: string;
  packageNightsError: (n: number) => string;
  includedInPackage: string;
  packageServicesNotice: string;
  kidsOccupancyNotice: string;
  upTo?: string;
  datesConflict?: string;
  guestPageNotice: string;
  gdprNote: string;
}

const translations: Record<BookingLang, any> = {
  uk: {
    brandName: 'QA Glamping',
    back: 'Назад',
    next: 'Далі',
    selectDates: 'Підтверди дати',
    checkInCheckOutDesc: 'Вибери період свого відпочинку.',
    notSelected: 'Не обрано',
    checkIn: 'Заїзд',
    checkOut: 'Виїзд',
    nightsShort: 'ночі',
    adults: 'Дорослі',
    children: 'Діти',
    step1: 'Дати',
    step2: 'Будинок',
    step3: 'Контакти',
    step4: 'Сервіси',
    step5: 'Оплата',
    monthNames: ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"],
    dayNamesShort: ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    dates: 'Дати',
    selectCheckIn: 'Оберіть дату заїзду',
    selectCheckOut: 'Оберіть дату виїзду',
    couponCode: 'Промокод',
    apply: 'Застосувати',
    certificateCode: 'Код сертифіката',
    selectAccommodation: 'Обери будинок',
    availableForDates: 'Доступні варіанти на твої дати.',
    noUnitsFound: 'На жаль, на ці дати немає вільних будинків.',
    multiHouseInfo: 'Можна обрати декілька будинків',
    totalFor: 'Разом за',
    guests: 'гостей',
    petFriendly: 'Дозволено з тваринами',
    petFriendlyDesc: 'Доплата за улюбленця',
    petCheckbox: 'З нами тваринка',
    stubPricing: 'Ціна може змінитися',
    addHouse: 'Додати будинок',
    selectedHouse: 'Обрано',
    amenitiesTitle: 'Зручності',
    adultsCount: 'Дорослих',
    childrenCount: 'Дітей',
    petPresence: 'Тварини',
    closeCard: 'Закрити',
    bookHouse: 'Забронювати',
    noAvailability: 'Немає вільних будинків',
    noAvailabilityDesc: 'Спробуйте інші дати',
    housePlaceholder: 'Будинок не обрано',
    guestInfoTitle: 'Твої контакти',
    confirmationEmailNote: 'Підтвердження прийде миттєво на email.',
    firstName: "Ім'я",
    lastName: 'Прізвище',
    email: 'Email',
    phone: 'Телефон',
    agreeTerms: 'Я погоджуюсь з умовами',
    payAndConfirm: 'Оплатити та підтвердити',
    addToStayTitle: 'Додати до відпочинку?',
    everythingOptional: 'Все опційне. Можна пропустити і додати пізніше.',
    skipLink: 'Пропустити — не треба нічого',
    bookingConfirmedTitle: 'Бронювання підтверджено!',
    bookingConfirmedDesc: 'Ми чекаємо на вас',
    saunaTitle: 'Сауна',
    saunaPersons: 'до 6 осіб',
    saunaMinHours: 'мінімум 2 години',
    saunaDesc: 'Приватна сауна з панорамним видом',
    saunaPerHour: 'год',
    saunaAddToBooking: 'Додати сауну',
    editService: 'Редагувати',
    removeService: 'Видалити',
    saunaDate: 'Дата сауни',
    selectTime: 'Оберіть час',
    saunaHours: 'Кількість годин',
    saunaBroom: 'Віник',
    totalLabel: 'Разом',
    closePopup: 'Закрити',
    bookService: 'Додати',
    myDishes: 'Меню сніданків',
    tubTitle: 'Чан',
    breakfastTitle: 'Сніданок',
    lateCheckoutTitle: 'Пізній виїзд',
    earlyCheckinTitle: 'Ранній заїзд',
    paymentTitle: 'Оплата',
    securePaymentNote: 'Захищена оплата Teya. Підтвердження миттєво.',
    additionalServices: 'Додаткові сервіси',
    total: 'Всього',
    payNow: 'Оплатити',
    processing: 'Обробка...',
    including: 'Включаючи всі податки',
    extraPersonCharge: 'Доплата за додаткову людину',
    redirectingToPayment: 'Перенаправлення на оплату...',
    paymentFailed: 'Оплата не пройшла',
    paymentFailedDesc: 'Сталась помилка при обробці платежу. Спробуйте ще раз.',
    tryAgain: 'Спробувати знову',
    paymentSuccess: 'Оплата успішна!',
    paymentSuccessDesc: 'Ваш платіж прийнято.',
    bookedSuccess: 'Заброньовано!',
    bookingSuccess: 'Бронювання підтверджено!',
    bookingSuccessDesc: 'Дякуємо за бронювання. Ми надіслали підтвердження на ваш email.',
    bookingNumber: 'Номер бронювання',
    bookingId: 'ID бронювання',
    accommodation: 'Будинок',
    houseName: 'Будинок',
    nights: 'Ночей',
    discount: 'Знижка',
    serviceTotal: 'Сума за сервіси',
    weWillContact: 'Ми звʼяжемося з вами незабаром.',
    purchasedServicesTitle: 'Придбані сервіси',
    backToStart: 'На початок',
    supportContactNote: "Якщо щось — пиши на hello@qa-glamping.eu або +420 773 708 849",
    finishBooking: 'Завершити',
    poweredBy: 'Powered by ALiSiO',
    guestsShort: 'гостей',
    errorOccurred: 'Сталась помилка. Спробуйте ще раз.',
    offerApplied: 'Промокод застосовано!',
    yourChoice: 'Ваш вибір',
    yourHouse: 'Ваш будинок',
    bookingDetails: 'Деталі бронювання',
    breakfastInfo: 'Сніданок включено',
    wantButton: 'Хочу',
    servicesEmpty: 'Немає доступних сервісів',
    tubDesc: 'Дерев\'яний чан з підігрівом на вулиці',
    tubPerHour: 'год',
    tubAddToBooking: 'Додати чан',
    lateCheckoutDesc: 'Виїзд до 14:00 замість 11:00',
    earlyCheckinDesc: 'Заїзд з 12:00 замість 15:00',
    skipToThankYou: 'Пропустити і завершити',
    confirmServices: 'Підтвердити сервіси',
    paymentSubtitle: 'Обери спосіб оплати',
    checkInShort: 'Заїзд',
    checkOutShort: 'Виїзд',
    yourSelection: 'Ваш вибір',
    night: 'ніч',
    youSelected: 'Ти обрав',
    checkDetailsBelow: 'Перевір деталі нижче.',
    from: 'з',
    to: 'до',
    duration: 'Тривалість',
    nightsWord: (n: number) => n === 1 ? 'ніч' : n < 5 ? 'ночі' : 'ночей',
    packagePrefix: 'Пакет',
    packageNightsError: (n: number) => `Оберіть рівно ${n} ${n === 1 ? 'ніч' : n < 5 ? 'ночі' : 'ночей'}, щоб застосувати пакет`,
    includedInPackage: 'Включено в пакет',
    packageServicesNotice: 'Деякі послуги вже включені у ваш пакет. Ви можете обрати додаткові за бажанням.',
    kidsOccupancyNotice: 'У будиночку одне велике ліжко — ідеально для двох дорослих. Якщо з вами дитина, ми завжди раді зробити виняток: маленькі гості не займають окреме спальне місце 😊',
    upTo: 'до',
    datesConflict: 'На жаль, ці дати вже заброньовано. Оберіть інші дати.',
    guestPageNotice: 'Після заповнення форми ми надішлемо вам email з посиланням на вашу гостьову сторінку. Там ви знайдете пароль від будинку та Wi-Fi, точну адресу та інші деталі — після підтвердження оплати.',
    gdprNote: 'Натискаючи «Далі», ви даєте згоду на обробку ваших персональних даних відповідно до нашої Політики конфіденційності.',
  },
  en: {
    brandName: 'QA Glamping',
    back: 'Back',
    next: 'Next',
    selectDates: 'Confirm dates',
    checkInCheckOutDesc: 'Choose your stay period.',
    notSelected: 'Not selected',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    nightsShort: 'nights',
    adults: 'Adults',
    children: 'Children',
    step1: 'Dates',
    step2: 'House',
    step3: 'Contacts',
    step4: 'Services',
    step5: 'Payment',
    monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    dayNamesShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    dates: 'Dates',
    selectCheckIn: 'Select check-in date',
    selectCheckOut: 'Select check-out date',
    couponCode: 'Coupon code',
    apply: 'Apply',
    certificateCode: 'Certificate code',
    selectAccommodation: 'Choose house',
    availableForDates: 'Available options for your dates.',
    noUnitsFound: 'Sorry, no houses available for these dates.',
    multiHouseInfo: 'You can select multiple houses',
    totalFor: 'Total for',
    guests: 'guests',
    petFriendly: 'Pet friendly',
    petFriendlyDesc: 'Charge for pet',
    petCheckbox: 'Traveling with a pet',
    stubPricing: 'Pricing may change',
    addHouse: 'Add house',
    selectedHouse: 'Selected',
    amenitiesTitle: 'Amenities',
    adultsCount: 'Adults',
    childrenCount: 'Children',
    petPresence: 'Pets',
    closeCard: 'Close',
    bookHouse: 'Book',
    noAvailability: 'No availability',
    noAvailabilityDesc: 'Try other dates',
    housePlaceholder: 'No house selected',
    guestInfoTitle: 'Your contacts',
    confirmationEmailNote: 'Confirmation will be sent instantly to your email.',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    agreeTerms: 'I agree to terms',
    payAndConfirm: 'Pay and confirm',
    addToStayTitle: 'Add to your stay?',
    everythingOptional: 'Everything is optional. You can skip and add later.',
    skipLink: 'Skip — I don\'t need anything',
    bookingConfirmedTitle: 'Booking confirmed!',
    bookingConfirmedDesc: 'We are looking forward to seeing you',
    saunaTitle: 'Sauna',
    saunaPersons: 'up to 6 people',
    saunaMinHours: 'min 2 hours',
    saunaDesc: 'Private sauna with panoramic view',
    saunaPerHour: 'hr',
    saunaAddToBooking: 'Add sauna',
    editService: 'Edit',
    removeService: 'Remove',
    saunaDate: 'Sauna date',
    selectTime: 'Select time',
    saunaHours: 'Number of hours',
    saunaBroom: 'Broom',
    totalLabel: 'Total',
    closePopup: 'Close',
    bookService: 'Add',
    myDishes: 'Breakfast menu',
    tubTitle: 'Hot tub',
    breakfastTitle: 'Breakfast',
    lateCheckoutTitle: 'Late checkout',
    earlyCheckinTitle: 'Early checkin',
    paymentTitle: 'Payment',
    securePaymentNote: 'Secure Teya payment. Instant confirmation.',
    additionalServices: 'Additional services',
    total: 'Total',
    payNow: 'Pay Now',
    processing: 'Processing...',
    including: 'Including all taxes',
    extraPersonCharge: 'Extra person charge',
    redirectingToPayment: 'Redirecting to payment...',
    paymentFailed: 'Payment failed',
    paymentFailedDesc: 'An error occurred while processing your payment. Please try again.',
    tryAgain: 'Try again',
    paymentSuccess: 'Payment successful!',
    paymentSuccessDesc: 'Your payment has been accepted.',
    bookedSuccess: 'Booked!',
    bookingSuccess: 'Booking confirmed!',
    bookingSuccessDesc: 'Thank you for your booking. We sent a confirmation to your email.',
    bookingNumber: 'Booking Number',
    bookingId: 'Booking ID',
    accommodation: 'House',
    houseName: 'House',
    nights: 'Nights',
    discount: 'Discount',
    serviceTotal: 'Services total',
    weWillContact: 'We will contact you shortly.',
    purchasedServicesTitle: 'Purchased services',
    backToStart: 'Back to start',
    supportContactNote: "If any questions — contact hello@qa-glamping.eu or +420 773 708 849",
    finishBooking: 'Finish',
    poweredBy: 'Powered by ALiSiO',
    guestsShort: 'guests',
    errorOccurred: 'An error occurred. Please try again.',
    offerApplied: 'Coupon code applied!',
    yourChoice: 'Your choice',
    yourHouse: 'Your house',
    bookingDetails: 'Booking details',
    breakfastInfo: 'Breakfast included',
    wantButton: 'I want it',
    servicesEmpty: 'No services available',
    tubDesc: 'Outdoor heated wooden hot tub',
    tubPerHour: 'hr',
    tubAddToBooking: 'Add hot tub',
    lateCheckoutDesc: 'Check-out by 14:00 instead of 11:00',
    earlyCheckinDesc: 'Check-in from 12:00 instead of 15:00',
    skipToThankYou: 'Skip and finish',
    confirmServices: 'Confirm services',
    paymentSubtitle: 'Choose payment method',
    checkInShort: 'Check-in',
    checkOutShort: 'Check-out',
    yourSelection: 'Your selection',
    night: 'night',
    youSelected: 'You selected',
    checkDetailsBelow: 'Check details below.',
    from: 'from',
    to: 'to',
    duration: 'Duration',
    nightsWord: (n: number) => n === 1 ? 'night' : 'nights',
    packagePrefix: 'Package',
    packageNightsError: (n: number) => `Select exactly ${n} night${n === 1 ? '' : 's'} to apply the package`,
    includedInPackage: 'Included in package',
    packageServicesNotice: 'Some services are already included in your package. You can choose additional ones if you wish.',
    kidsOccupancyNotice: 'The house has one large bed — ideal for two adults. If you have a child, we are happy to make an exception: young guests do not require a separate bed 😊',
    upTo: 'up to',
    datesConflict: 'Sorry, these dates are already booked. Please choose different dates.',
    guestPageNotice: 'After submitting the form, we will send you an email with a link to your guest page. There you will find the house & Wi-Fi password, exact address and other details — available after payment confirmation.',
    gdprNote: 'By clicking "Next", you consent to the processing of your personal data in accordance with our Privacy Policy.',
  },
  cs: {
    brandName: 'QA Glamping',
    back: 'Zpět',
    next: 'Další',
    selectDates: 'Potvrdit termín',
    checkInCheckOutDesc: 'Vyberte si období svého pobytu.',
    notSelected: 'Nevybráno',
    checkIn: 'Příjezd',
    checkOut: 'Odjezd',
    nightsShort: 'noci',
    adults: 'Dospělí',
    children: 'Děti',
    step1: 'Termín',
    step2: 'Dům',
    step3: 'Kontakty',
    step4: 'Služby',
    step5: 'Platba',
    monthNames: ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"],
    dayNamesShort: ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"],
    dates: 'Termín',
    selectCheckIn: 'Vyberte datum příjezdu',
    selectCheckOut: 'Vyberte datum odjezdu',
    couponCode: 'Slevový kód',
    apply: 'Použít',
    certificateCode: 'Kód certifikátu',
    selectAccommodation: 'Vyberte dům',
    availableForDates: 'Dostupné možnosti pro vaše termíny.',
    noUnitsFound: 'Bohužel na tyto termíny nejsou volné domy.',
    multiHouseInfo: 'Můžete vybrat více domů',
    totalFor: 'Celkem za',
    guests: 'hostů',
    petFriendly: 'Domácí mazlíčci povoleni',
    petFriendlyDesc: 'Poplatek za zvíře',
    petCheckbox: 'Cestuji se zvířetem',
    stubPricing: 'Cena se může změnit',
    addHouse: 'Přidat dům',
    selectedHouse: 'Vybráno',
    amenitiesTitle: 'Vybavení',
    adultsCount: 'Dospělých',
    childrenCount: 'Dětí',
    petPresence: 'Zvířata',
    closeCard: 'Zavřít',
    bookHouse: 'Rezervovat',
    noAvailability: 'Žádná dostupnost',
    noAvailabilityDesc: 'Zkuste jiné termíny',
    housePlaceholder: 'Není vybrán žádný dům',
    guestInfoTitle: 'Vaše kontakty',
    confirmationEmailNote: 'Potvrzení bude okamžitě zasláno na váš e-mail.',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    email: 'Email',
    phone: 'Telefon',
    agreeTerms: 'Souhlasím s podmínkami',
    payAndConfirm: 'Zaplatit a potvrdit',
    addToStayTitle: 'Přidat k pobytu?',
    everythingOptional: 'Vše je volitelné. Můžete přeskočit a přidat později.',
    skipLink: 'Přeskočit — nic nepotřebuji',
    bookingConfirmedTitle: 'Rezervace potvrzena!',
    bookingConfirmedDesc: 'Těšíme se na vás',
    saunaTitle: 'Sauna',
    saunaPersons: 'až 6 osob',
    saunaMinHours: 'min 2 hodiny',
    saunaDesc: 'Soukromá sauna s panoramatickým výhledem',
    saunaPerHour: 'hod',
    saunaAddToBooking: 'Přidat saunu',
    editService: 'Upravit',
    removeService: 'Odstranit',
    saunaDate: 'Datum sauny',
    selectTime: 'Vyberte čas',
    saunaHours: 'Počet hodin',
    saunaBroom: 'Metlička',
    totalLabel: 'Celkem',
    closePopup: 'Zavřít',
    bookService: 'Přidat',
    myDishes: 'Snídaňové menu',
    tubTitle: 'Koupací sud',
    breakfastTitle: 'Snídaně',
    lateCheckoutTitle: 'Pozdní odjezd',
    earlyCheckinTitle: 'Brzký příjezd',
    paymentTitle: 'Platba',
    securePaymentNote: 'Zabezpečená platba Teya. Okamžité potvrzení.',
    additionalServices: 'Doplňkové služby',
    total: 'Celkem',
    payNow: 'Zaplatit',
    processing: 'Zpracování...',
    including: 'Včetně všech daní',
    extraPersonCharge: 'Příplatek za další osobu',
    redirectingToPayment: 'Přesměrování na platbu...',
    paymentFailed: 'Platba se nezdařila',
    paymentFailedDesc: 'Při zpracování platby nastala chyba. Zkuste to prosím znovu.',
    tryAgain: 'Zkusit znovu',
    paymentSuccess: 'Platba proběhla úspěšně!',
    paymentSuccessDesc: 'Vaše platba byla přijata.',
    bookedSuccess: 'Rezervováno!',
    bookingSuccess: 'Rezervace potvrzena!',
    bookingSuccessDesc: 'Děkujeme za rezervaci. Potvrzení jsme zaslali na váš e-mail.',
    bookingNumber: 'Číslo rezervace',
    bookingId: 'ID rezervace',
    accommodation: 'Dům',
    houseName: 'Dům',
    nights: 'Nocí',
    discount: 'Sleva',
    serviceTotal: 'Celkem za služby',
    weWillContact: 'Brzy vás kontaktujeme.',
    purchasedServicesTitle: 'Zakoupené služby',
    backToStart: 'Na začátek',
    supportContactNote: "V případě dotazů pište na hello@qa-glamping.eu nebo volejte +420 773 708 849",
    finishBooking: 'Dokončit',
    poweredBy: 'Powered by ALiSiO',
    guestsShort: 'hostů',
    errorOccurred: 'Nastala chyba. Zkuste to prosím znovu.',
    offerApplied: 'Slevový kód byl použit!',
    yourChoice: 'Váš výběr',
    yourHouse: 'Váš dům',
    bookingDetails: 'Detaily rezervace',
    breakfastInfo: 'Snídaně v ceně',
    wantButton: 'Chci',
    servicesEmpty: 'Žádné dostupné služby',
    tubDesc: 'Venkovní vyhřívaný dřevěný koupací sud',
    tubPerHour: 'hod',
    tubAddToBooking: 'Přidat koupací sud',
    lateCheckoutDesc: 'Odjezd do 14:00 místo 11:00',
    earlyCheckinDesc: 'Příjezd od 12:00 místo 15:00',
    skipToThankYou: 'Přeskočit a dokončit',
    confirmServices: 'Potvrdit služby',
    paymentSubtitle: 'Vyberte způsob platby',
    checkInShort: 'Příjezd',
    checkOutShort: 'Odjezd',
    yourSelection: 'Váš výběr',
    night: 'noc',
    youSelected: 'Vybrali jste',
    checkDetailsBelow: 'Zkontrolujte podrobnosti níže.',
    from: 'od',
    to: 'do',
    duration: 'Délka',
    nightsWord: (n: number) => n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí',
    packagePrefix: 'Balíček',
    packageNightsError: (n: number) => `Vyberte přesně ${n} noc${n === 1 ? '' : (n < 5 ? 'i' : 'í')} pro použití balíčku`,
    includedInPackage: 'Zahrnuto v balíčku',
    packageServicesNotice: 'Některé služby jsou již zahrnuty ve vašem balíčku. Pokud si přejete, můžete si vybrat další.',
    kidsOccupancyNotice: 'Dům má jednu velkou postel — ideální pro dva dospělé. Pokud máte dítě, rádi uděláme výjimku: malí hosté nepotřebují samostatnou postel 😊',
    upTo: 'až',
    datesConflict: 'Bohužel, tyto termíny jsou již obsazené. Zkuste prosím jiné termíny.',
    guestPageNotice: 'Po vyplnění formuláře vám zašleme e-mail s odkazem na vaši stránku pro hosty. Tam najdete heslo k domu a Wi-Fi, přesnou adresu a další podrobnosti — dostupné po potvrzení platby.',
    gdprNote: 'Kliknutím na „Další" souhlasíte se zpracováním vašich osobních údajů v souladu s našimi Zásadami ochrany osobních údajů.',
  },
  de: {
    brandName: 'QA Glamping',
    back: 'Zurück',
    next: 'Weiter',
    selectDates: 'Termine bestätigen',
    checkInCheckOutDesc: 'Wählen Sie Ihren Aufenthaltszeitraum.',
    notSelected: 'Nicht ausgewählt',
    checkIn: 'Anreise',
    checkOut: 'Abreise',
    nightsShort: 'Nächte',
    adults: 'Erwachsene',
    children: 'Kinder',
    step1: 'Termine',
    step2: 'Haus',
    step3: 'Kontakte',
    step4: 'Services',
    step5: 'Zahlung',
    monthNames: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    dayNamesShort: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    dates: 'Termine',
    selectCheckIn: 'Anreisedatum auswählen',
    selectCheckOut: 'Abreisedatum auswählen',
    couponCode: 'Gutscheincode',
    apply: 'Anwenden',
    certificateCode: 'Zertifikatscode',
    selectAccommodation: 'Haus wählen',
    availableForDates: 'Verfügbare Optionen für Ihre Termine.',
    noUnitsFound: 'Leider sind für diese Termine keine Häuser verfügbar.',
    multiHouseInfo: 'Sie können mehrere Häuser auswählen',
    totalFor: 'Gesamt für',
    guests: 'Gäste',
    petFriendly: 'Haustierfreundlich',
    petFriendlyDesc: 'Gebühr für Haustier',
    petCheckbox: 'Mit Haustier reisen',
    stubPricing: 'Preise können sich ändern',
    addHouse: 'Haus hinzufügen',
    selectedHouse: 'Ausgewählt',
    amenitiesTitle: 'Ausstattung',
    adultsCount: 'Erwachsene',
    childrenCount: 'Kinder',
    petPresence: 'Haustiere',
    closeCard: 'Schließen',
    bookHouse: 'Buchen',
    noAvailability: 'Keine Verfügbarkeit',
    noAvailabilityDesc: 'Andere Termine versuchen',
    housePlaceholder: 'Kein Haus ausgewählt',
    guestInfoTitle: 'Ihre Kontakte',
    confirmationEmailNote: 'Die Bestätigung erfolgt sofort per E-Mail.',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'Email',
    phone: 'Telefon',
    agreeTerms: 'Ich stimme den Bedingungen zu',
    payAndConfirm: 'Bezahlen und bestätigen',
    addToStayTitle: 'Zu Ihrem Aufenthalt hinzufügen?',
    everythingOptional: 'Alles ist optional. Sie können überspringen und später hinzufügen.',
    skipLink: 'Überspringen — ich brauche nichts',
    bookingConfirmedTitle: 'Buchung bestätigt!',
    bookingConfirmedDesc: 'Wir freuen uns auf Sie',
    saunaTitle: 'Sauna',
    saunaPersons: 'bis zu 6 Personen',
    saunaMinHours: 'min. 2 Stunden',
    saunaDesc: 'Private Sauna mit Panoramablick',
    saunaPerHour: 'Std',
    saunaAddToBooking: 'Sauna hinzufügen',
    editService: 'Bearbeiten',
    removeService: 'Entfernen',
    saunaDate: 'Saunadatum',
    selectTime: 'Zeit wählen',
    saunaHours: 'Stundenanzahl',
    saunaBroom: 'Besen',
    totalLabel: 'Gesamt',
    closePopup: 'Schließen',
    bookService: 'Hinzufügen',
    myDishes: 'Frühstücksmenü',
    tubTitle: 'Badezuber',
    breakfastTitle: 'Frühstück',
    lateCheckoutTitle: 'Später Check-out',
    earlyCheckinTitle: 'Früher Check-in',
    paymentTitle: 'Zahlung',
    securePaymentNote: 'Sichere Teya-Zahlung. Sofortige Bestätigung.',
    additionalServices: 'Zusatzleistungen',
    total: 'Gesamt',
    payNow: 'Jetzt bezahlen',
    processing: 'Verarbeitung...',
    including: 'Inklusive aller Steuern',
    extraPersonCharge: 'Aufpreis für zusätzliche Person',
    redirectingToPayment: 'Weiterleitung zur Zahlung...',
    paymentFailed: 'Zahlung fehlgeschlagen',
    paymentFailedDesc: 'Bei der Zahlungsabwicklung ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.',
    tryAgain: 'Erneut versuchen',
    paymentSuccess: 'Zahlung erfolgreich!',
    paymentSuccessDesc: 'Ihre Zahlung wurde akzeptiert.',
    bookedSuccess: 'Gebucht!',
    bookingSuccess: 'Buchung bestätigt!',
    bookingSuccessDesc: 'Vielen Dank für Ihre Buchung. Wir haben eine Bestätigung an Ihre E-Mail gesendet.',
    bookingNumber: 'Buchungsnummer',
    bookingId: 'Buchungs-ID',
    accommodation: 'Haus',
    houseName: 'Haus',
    nights: 'Nächte',
    discount: 'Rabatt',
    serviceTotal: 'Gesamtbetrag Leistungen',
    weWillContact: 'Wir werden uns in Kürze bei Ihnen melden.',
    purchasedServicesTitle: 'Gebuchte Leistungen',
    backToStart: 'Zum Anfang',
    supportContactNote: "Bei Fragen — schreiben Sie an hello@qa-glamping.eu oder +420 773 708 849",
    finishBooking: 'Abschließen',
    poweredBy: 'Powered by ALiSiO',
    guestsShort: 'Gäste',
    errorOccurred: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
    offerApplied: 'Gutscheincode angewendet!',
    yourChoice: 'Ihre Wahl',
    yourHouse: 'Ihr Haus',
    bookingDetails: 'Buchungsdetails',
    breakfastInfo: 'Frühstück inklusive',
    wantButton: 'Ich möchte es',
    servicesEmpty: 'Keine verfügbaren Leistungen',
    tubDesc: 'Beheizter Holzbadezuber im Freien',
    tubPerHour: 'Std',
    tubAddToBooking: 'Badezuber hinzufügen',
    lateCheckoutDesc: 'Check-out bis 14:00 statt 11:00',
    earlyCheckinDesc: 'Check-in ab 12:00 statt 15:00',
    skipToThankYou: 'Überspringen und abschließen',
    confirmServices: 'Leistungen bestätigen',
    paymentSubtitle: 'Zahlungsmethode wählen',
    checkInShort: 'Anreise',
    checkOutShort: 'Abreise',
    yourSelection: 'Ihre Auswahl',
    night: 'Nacht',
    youSelected: 'Ausgewählt',
    checkDetailsBelow: 'Details unten prüfen.',
    from: 'ab',
    to: 'bis',
    duration: 'Dauer',
    nightsWord: (n: number) => n === 1 ? 'Nacht' : 'Nächte',
    packagePrefix: 'Paket',
    packageNightsError: (n: number) => `Wählen Sie genau ${n} ${n === 1 ? 'Nacht' : 'Nächte'}, um das Paket anzuwenden`,
    includedInPackage: 'Im Paket enthalten',
    packageServicesNotice: 'Einige Dienstleistungen sind bereits in Ihrem Paket enthalten. Sie können auf Wunsch weitere hinzufügen.',
    kidsOccupancyNotice: 'Das Haus verfügt über ein großes Bett — ideal für zwei Erwachsene. Wenn Sie ein Kind haben, machen wir gerne eine Ausnahme: Kleine Gäste benötigen kein separates Bett 😊',
    upTo: 'bis zu',
    datesConflict: 'Leider sind diese Termine bereits gebucht. Bitte wählen Sie andere Termine.',
    guestPageNotice: 'Nach dem Absenden des Formulars senden wir Ihnen eine E-Mail mit einem Link zu Ihrer Gästseite. Dort finden Sie das Passwort für das Haus und WLAN, die genaue Adresse und weitere Details — nach Zahlungsbestätigung verfügbar.',
    gdprNote: 'Mit dem Klick auf „Weiter" stimmen Sie der Verarbeitung Ihrer personenbezogenen Daten gemäß unserer Datenschutzerklärung zu.',
  },
};

export function getBookingTranslations(lang: BookingLang): BookingTranslations {
  return translations[lang] || translations.uk;
}
