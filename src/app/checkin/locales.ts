/**
 * Self check-in — four languages, one screen's worth of words each.
 *
 * Deliberately its own file rather than a reach into the website's `booking_b`
 * bundle: that lives in another repository and another deployment, and a guest
 * standing at the gate should not depend on the marketing site being up. The
 * item names below are the same ones the price-list popup already carries.
 */
export type Lang = 'cs' | 'en' | 'de' | 'uk';

export const LANGS: { code: Lang; flag: string; name: string }[] = [
  { code: 'cs', flag: '🇨🇿', name: 'Čeština' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'uk', flag: '🇺🇦', name: 'Українська' },
];

export const ITEM_NAMES: Record<string, Record<Lang, string>> = {
  small_tent: { cs: 'Malý stan', en: 'Small tent', de: 'Kleines Zelt', uk: 'Малий намет' },
  large_tent: { cs: 'Velký stan', en: 'Large tent', de: 'Großes Zelt', uk: 'Великий намет' },
  car: { cs: 'Auto', en: 'Car', de: 'Auto', uk: 'Авто' },
  minibus: { cs: 'Minibus / Dodávka', en: 'Minibus / Van', de: 'Kleinbus', uk: 'Мінівен' },
  caravan: { cs: 'Karavan', en: 'Caravan', de: 'Wohnwagen', uk: 'Караван' },
  motorhome: { cs: 'Obytné auto', en: 'Motorhome', de: 'Wohnmobil', uk: 'Автодім' },
  motorcycle: { cs: 'Motocykl', en: 'Motorcycle', de: 'Motorrad', uk: 'Мотоцикл' },
};

interface Dict {
  pickLang: string;
  haveBooking: string; haveBookingSub: string;
  noBooking: string; noBookingSub: string;
  contactAdmin: string;
  findTitle: string; findSub: string;
  phone: string; surname: string; find: string; searching: string;
  notFound: string; notFoundSub: string; throttled: string; noPage: string;
  campTitle: string; campSub: string; yourSetup: string;
  guests: string; adults: string; children: string; childrenFree: string;
  extras: string; electricity: string; pets: string;
  motorhomeService: string; once: string;
  perNight: string; perAnimalNight: string;
  nights: string; night: string; oneMoreNight: string; leavingOn: string;
  total: string; touristTax: string; priceIncl: string;
  yourName: string; yourPhone: string;
  payAtReception: string; payAtReceptionSub: string;
  finish: string; working: string;
  doneTitle: string; doneSub: string; yourSpot: string; openGuestPage: string;
  pickSomething: string; nameRequired: string;
  back: string;
}

export const T: Record<Lang, Dict> = {
  cs: {
    pickLang: 'Vyberte jazyk',
    haveBooking: '🔑 Mám rezervaci', haveBookingSub: 'Najdeme ji a dáme vám pokyny k příjezdu.',
    noBooking: '⛺ Nemám rezervaci', noBookingSub: 'Vyberte si místo — ubytujeme vás hned teď.',
    contactAdmin: '💬 Kontaktovat správce',
    findTitle: 'Najít rezervaci', findSub: 'Zadejte telefon a příjmení, jak jste je uvedli při rezervaci.',
    phone: 'Telefon', surname: 'Příjmení', find: 'Najít', searching: 'Hledám…',
    notFound: 'Rezervaci jsme nenašli',
    notFoundSub: 'Zkontrolujte číslo a příjmení. Hledáme jen příjezdy na dnešek a zítřek.',
    throttled: 'Příliš mnoho pokusů. Zkuste to za 15 minut nebo napište správci.',
    noPage: 'Rezervaci jsme našli, ale nemá stránku hosta. Napište prosím správci.',
    campTitle: 'Kemping', campSub: 'Vyberte vše, co přivážíte', yourSetup: 'Vaše vybavení',
    guests: 'Hosté', adults: 'Dospělí', children: 'Děti (3-15)', childrenFree: 'Do 3 let — zdarma',
    extras: 'Doplňky', electricity: 'Přípojka elektřiny', pets: 'Zvířata',
    motorhomeService: 'Servis obytného auta', once: 'jednorázově',
    perNight: 'Kč / noc', perAnimalNight: 'Kč / zvíře / noc',
    nights: 'nocí', night: 'noc', oneMoreNight: '+ další noc', leavingOn: 'Odjezd',
    total: 'Celkem', touristTax: 'Turistický poplatek', priceIncl: 'Cena včetně poplatku',
    yourName: 'Jméno a příjmení', yourPhone: 'Telefon',
    payAtReception: 'Rezervovat a zaplatit na recepci',
    payAtReceptionSub: 'Hotově nebo kartou. Místo je pro vás rezervováno.',
    finish: 'Dokončit', working: 'Pracuji…',
    doneTitle: 'Hotovo!', doneSub: 'Vaše místo je zarezervováno.',
    yourSpot: 'Vaše místo', openGuestPage: 'Otevřít pokyny k příjezdu →',
    pickSomething: 'Vyberte alespoň jednu položku.', nameRequired: 'Zadejte jméno a telefon.',
    back: '‹ Zpět',
  },
  en: {
    pickLang: 'Choose your language',
    haveBooking: '🔑 I have a booking', haveBookingSub: "We'll find it and give you arrival instructions.",
    noBooking: '⛺ I have no booking', noBookingSub: 'Pick a spot — we can check you in right now.',
    contactAdmin: '💬 Contact the manager',
    findTitle: 'Find your booking', findSub: 'Enter the phone number and surname you booked with.',
    phone: 'Phone', surname: 'Surname', find: 'Find', searching: 'Searching…',
    notFound: "We couldn't find that booking",
    notFoundSub: 'Check the number and surname. We only search arrivals for today and tomorrow.',
    throttled: 'Too many attempts. Try again in 15 minutes or message the manager.',
    noPage: 'We found the booking but it has no guest page. Please message the manager.',
    campTitle: 'Camping', campSub: "Select everything you're bringing", yourSetup: 'Your setup',
    guests: 'Guests', adults: 'Adults', children: 'Children (3-15)', childrenFree: 'Under 3 — free',
    extras: 'Extras', electricity: 'Electricity hookup', pets: 'Pets',
    motorhomeService: 'Motorhome service', once: 'once',
    perNight: 'Kč / night', perAnimalNight: 'Kč / animal / night',
    nights: 'nights', night: 'night', oneMoreNight: '+ one more night', leavingOn: 'Leaving',
    total: 'Total', touristTax: 'Tourist tax', priceIncl: 'Price includes the tourist tax',
    yourName: 'Full name', yourPhone: 'Phone',
    payAtReception: 'Book and pay at reception',
    payAtReceptionSub: 'Cash or card. Your spot is held for you.',
    finish: 'Finish', working: 'Working…',
    doneTitle: 'All set!', doneSub: 'Your spot is booked.',
    yourSpot: 'Your spot', openGuestPage: 'Open arrival instructions →',
    pickSomething: 'Select at least one item.', nameRequired: 'Enter your name and phone.',
    back: '‹ Back',
  },
  de: {
    pickLang: 'Sprache wählen',
    haveBooking: '🔑 Ich habe eine Buchung', haveBookingSub: 'Wir finden sie und geben Ihnen die Anfahrt.',
    noBooking: '⛺ Ich habe keine Buchung', noBookingSub: 'Platz wählen — wir checken Sie sofort ein.',
    contactAdmin: '💬 Verwalter kontaktieren',
    findTitle: 'Buchung finden', findSub: 'Telefonnummer und Nachname wie bei der Buchung.',
    phone: 'Telefon', surname: 'Nachname', find: 'Suchen', searching: 'Suche…',
    notFound: 'Buchung nicht gefunden',
    notFoundSub: 'Prüfen Sie Nummer und Nachname. Wir suchen nur Anreisen heute und morgen.',
    throttled: 'Zu viele Versuche. In 15 Minuten erneut oder den Verwalter anschreiben.',
    noPage: 'Buchung gefunden, aber ohne Gästeseite. Bitte den Verwalter anschreiben.',
    campTitle: 'Camping', campSub: 'Wählen Sie alles, was Sie mitbringen', yourSetup: 'Ihre Ausrüstung',
    guests: 'Gäste', adults: 'Erwachsene', children: 'Kinder (3-15)', childrenFree: 'Unter 3 — kostenlos',
    extras: 'Extras', electricity: 'Stromanschluss', pets: 'Haustiere',
    motorhomeService: 'Wohnmobil-Service', once: 'einmalig',
    perNight: 'Kč / Nacht', perAnimalNight: 'Kč / Tier / Nacht',
    nights: 'Nächte', night: 'Nacht', oneMoreNight: '+ eine Nacht', leavingOn: 'Abreise',
    total: 'Gesamt', touristTax: 'Kurtaxe', priceIncl: 'Preis inkl. Kurtaxe',
    yourName: 'Vor- und Nachname', yourPhone: 'Telefon',
    payAtReception: 'Buchen und an der Rezeption zahlen',
    payAtReceptionSub: 'Bar oder Karte. Ihr Platz ist reserviert.',
    finish: 'Fertig', working: 'Einen Moment…',
    doneTitle: 'Fertig!', doneSub: 'Ihr Platz ist gebucht.',
    yourSpot: 'Ihr Platz', openGuestPage: 'Anfahrt öffnen →',
    pickSomething: 'Wählen Sie mindestens eine Position.', nameRequired: 'Name und Telefon eingeben.',
    back: '‹ Zurück',
  },
  uk: {
    pickLang: 'Оберіть мову',
    haveBooking: '🔑 У мене є бронювання', haveBookingSub: 'Знайдемо його і дамо інструкції для заїзду.',
    noBooking: '⛺ У мене немає бронювання', noBookingSub: 'Оберіть місце — оформимо заселення зараз.',
    contactAdmin: '💬 Звʼязатися з адміністратором',
    findTitle: 'Знайти бронювання', findSub: 'Введіть телефон і прізвище, які вказували при бронюванні.',
    phone: 'Телефон', surname: 'Прізвище', find: 'Знайти', searching: 'Шукаю…',
    notFound: 'Бронювання не знайшли',
    notFoundSub: 'Перевірте номер і прізвище. Шукаємо лише заїзди на сьогодні й завтра.',
    throttled: 'Забагато спроб. Спробуйте за 15 хвилин або напишіть адміністратору.',
    noPage: 'Бронювання знайшли, але в нього немає гостьової сторінки. Напишіть адміністратору.',
    campTitle: 'Кемпінг', campSub: 'Оберіть усе, що привезли', yourSetup: 'Ваше спорядження',
    guests: 'Гості', adults: 'Дорослі', children: 'Діти (3-15)', childrenFree: 'До 3 років — безкоштовно',
    extras: 'Додатково', electricity: 'Підключення електрики', pets: 'Тварини',
    motorhomeService: 'Сервіс автодому', once: 'разово',
    perNight: 'Kč / ніч', perAnimalNight: 'Kč / тварина / ніч',
    nights: 'ночей', night: 'ніч', oneMoreNight: '+ ще ніч', leavingOn: 'Виїзд',
    total: 'Разом', touristTax: 'Курортний збір', priceIncl: 'Ціна вже зі збором',
    yourName: 'Імʼя та прізвище', yourPhone: 'Телефон',
    payAtReception: 'Забронювати й оплатити на ресепшн',
    payAtReceptionSub: 'Готівкою або карткою. Місце тримаємо за вами.',
    finish: 'Готово', working: 'Працюю…',
    doneTitle: 'Готово!', doneSub: 'Ваше місце заброньоване.',
    yourSpot: 'Ваше місце', openGuestPage: 'Відкрити інструкцію заїзду →',
    pickSomething: 'Оберіть хоча б одну позицію.', nameRequired: 'Введіть імʼя і телефон.',
    back: '‹ Назад',
  },
};
