// Static dictionary for translating Ukrainian DB content to guest languages.
// DB content is authored in Ukrainian; this maps known strings to all 6 guest languages.
// Key = Ukrainian source text (exact match after trim), value = { en, de, cs, pl, nl, fr }.
//
// Accessible from any layer (lib, modules, app) — unlike the app-layer version.

export const CONTENT_LANGS = ['en', 'de', 'cs', 'pl', 'nl', 'fr'] as const;
export type ContentLang = typeof CONTENT_LANGS[number];

type ContentDict = Record<string, Record<string, string>>;

// ─── Amenity Names ──────────────────────────────
const amenityNames: ContentDict = {
  'Комфортне ліжко':     { en: 'Comfortable bed', de: 'Komfortables Bett', cs: 'Pohodlná postel', pl: 'Wygodne łóżko', nl: 'Comfortabel bed', fr: 'Lit confortable' },
  'Душ':                 { en: 'Shower', de: 'Dusche', cs: 'Sprcha', pl: 'Prysznic', nl: 'Douche', fr: 'Douche' },
  'Душ/Ванна':           { en: 'Shower/Bath', de: 'Dusche/Bad', cs: 'Sprcha/Vana', pl: 'Prysznic/Wanna', nl: 'Douche/Bad', fr: 'Douche/Bain' },
  'Туалет':              { en: 'Toilet', de: 'Toilette', cs: 'WC', pl: 'Toaleta', nl: 'Toilet', fr: 'Toilettes' },
  'Кондиціонер':         { en: 'Air conditioning', de: 'Klimaanlage', cs: 'Klimatizace', pl: 'Klimatyzacja', nl: 'Airconditioning', fr: 'Climatisation' },
  'Опалення':            { en: 'Heating', de: 'Heizung', cs: 'Topení', pl: 'Ogrzewanie', nl: 'Verwarming', fr: 'Chauffage' },
  'Чайник':              { en: 'Kettle', de: 'Wasserkocher', cs: 'Rychlovarná konvice', pl: 'Czajnik', nl: 'Waterkoker', fr: 'Bouilloire' },
  'Чайник/Кавоварка':    { en: 'Kettle/Coffee maker', de: 'Wasserkocher/Kaffeemaschine', cs: 'Konvice/Kávovar', pl: 'Czajnik/Ekspres do kawy', nl: 'Waterkoker/Koffiemachine', fr: 'Bouilloire/Cafetière' },
  'Кавоварка':           { en: 'Coffee maker', de: 'Kaffeemaschine', cs: 'Kávovar', pl: 'Ekspres do kawy', nl: 'Koffiemachine', fr: 'Cafetière' },
  'Міні-холодильник':    { en: 'Mini fridge', de: 'Mini-Kühlschrank', cs: 'Mini lednička', pl: 'Mini lodówka', nl: 'Minibar', fr: 'Mini-réfrigérateur' },
  'Холодильник':         { en: 'Fridge', de: 'Kühlschrank', cs: 'Lednička', pl: 'Lodówka', nl: 'Koelkast', fr: 'Réfrigérateur' },
  'Мікрохвильовка':      { en: 'Microwave', de: 'Mikrowelle', cs: 'Mikrovlnná trouba', pl: 'Mikrofalówka', nl: 'Magnetron', fr: 'Four micro-ondes' },
  'Кухня':               { en: 'Kitchen', de: 'Küche', cs: 'Kuchyňka', pl: 'Kuchnia', nl: 'Keuken', fr: 'Cuisine' },
  'Міні-кухня':          { en: 'Kitchenette', de: 'Kochnische', cs: 'Kuchyňský kout', pl: 'Aneks kuchenny', nl: 'Kitchenette', fr: 'Kitchenette' },
  'Wi-Fi':               { en: 'Wi-Fi', de: 'WLAN', cs: 'Wi-Fi', pl: 'Wi-Fi', nl: 'Wi-Fi', fr: 'Wi-Fi' },
  'Тераса':              { en: 'Terrace', de: 'Terrasse', cs: 'Terasa', pl: 'Taras', nl: 'Terras', fr: 'Terrasse' },
  'Балкон':              { en: 'Balcony', de: 'Balkon', cs: 'Balkon', pl: 'Balkon', nl: 'Balkon', fr: 'Balcon' },
  'Замок':               { en: 'Lock', de: 'Schloss', cs: 'Zámek', pl: 'Zamek', nl: 'Slot', fr: 'Serrure' },
  'Рушники':             { en: 'Towels', de: 'Handtücher', cs: 'Ručníky', pl: 'Ręczniki', nl: 'Handdoeken', fr: 'Serviettes' },
  'Рушники та білизна':  { en: 'Towels & linen', de: 'Handtücher & Bettwäsche', cs: 'Ručníky a povlečení', pl: 'Ręczniki i pościel', nl: 'Handdoeken en linnengoed', fr: 'Serviettes et linge' },
  'Білизна':             { en: 'Bed linen', de: 'Bettwäsche', cs: 'Povlečení', pl: 'Pościel', nl: 'Beddengoed', fr: 'Linge de lit' },
  'Освітлення':          { en: 'Lighting', de: 'Beleuchtung', cs: 'Osvětlení', pl: 'Oświetlenie', nl: 'Verlichting', fr: 'Éclairage' },
  'Телевізор':           { en: 'TV', de: 'Fernseher', cs: 'Televize', pl: 'Telewizor', nl: 'TV', fr: 'Télévision' },
  'Косметика':           { en: 'Toiletries', de: 'Pflegeprodukte', cs: 'Kosmetika', pl: 'Kosmetyki', nl: 'Toiletartikelen', fr: 'Produits de toilette' },
  'Сейф':                { en: 'Safe', de: 'Safe', cs: 'Trezor', pl: 'Sejf', nl: 'Kluis', fr: 'Coffre-fort' },
  'Місце для намету':    { en: 'Tent pitch', de: 'Zeltplatz', cs: 'Místo pro stan', pl: 'Miejsce na namiot', nl: 'Tentplaats', fr: 'Emplacement tente' },
  'Місце для намету/автобудинку': { en: 'Tent/RV pitch', de: 'Zelt-/Wohnmobilstellplatz', cs: 'Místo pro stan/karavan', pl: 'Miejsce na namiot/kamper', nl: 'Tent/camperplaats', fr: 'Emplacement tente/camping-car' },
  'Електрика 220V':      { en: 'Power supply 220V', de: 'Stromanschluss 220V', cs: 'Elektřina 220V', pl: 'Prąd 220V', nl: 'Stroom 220V', fr: 'Électricité 220V' },
  'Спільний душ':        { en: 'Shared shower', de: 'Gemeinschaftsdusche', cs: 'Společná sprcha', pl: 'Wspólny prysznic', nl: 'Gedeelde douche', fr: 'Douche commune' },
  'Спільний туалет':     { en: 'Shared toilet', de: 'Gemeinschaftstoilette', cs: 'Společné WC', pl: 'Wspólna toaleta', nl: 'Gedeeld toilet', fr: 'Toilettes communes' },
  'Вода':                { en: 'Water', de: 'Wasser', cs: 'Voda', pl: 'Woda', nl: 'Water', fr: 'Eau' },
  'Паркомісце':          { en: 'Parking space', de: 'Parkplatz', cs: 'Parkovací místo', pl: 'Miejsce parkingowe', nl: 'Parkeerplaats', fr: 'Place de parking' },
  'Місце для вогнища':   { en: 'Fire pit', de: 'Feuerstelle', cs: 'Ohniště', pl: 'Miejsce na ognisko', nl: 'Vuurplaats', fr: 'Foyer extérieur' },
  'Барбекю':             { en: 'BBQ', de: 'Grill', cs: 'Gril', pl: 'Grill', nl: 'BBQ', fr: 'Barbecue' },
  'Піч':                 { en: 'Stove', de: 'Ofen', cs: 'Pec', pl: 'Piec', nl: 'Kachel', fr: 'Poêle' },
  'Камін':               { en: 'Fireplace', de: 'Kamin', cs: 'Krb', pl: 'Kominek', nl: 'Open haard', fr: 'Cheminée' },
  'Сауна':               { en: 'Sauna', de: 'Sauna', cs: 'Sauna', pl: 'Sauna', nl: 'Sauna', fr: 'Sauna' },
  'Джакузі':             { en: 'Jacuzzi', de: 'Whirlpool', cs: 'Vířivka', pl: 'Jacuzzi', nl: 'Jacuzzi', fr: 'Jacuzzi' },
  'Купіль':              { en: 'Plunge pool', de: 'Tauchbecken', cs: 'Studená lázeň', pl: 'Kąpiel', nl: 'Dompelbad', fr: 'Bain froid' },
  'Басейн':              { en: 'Pool', de: 'Pool', cs: 'Bazén', pl: 'Basen', nl: 'Zwembad', fr: 'Piscine' },
  'Гамак':               { en: 'Hammock', de: 'Hängematte', cs: 'Houpací síť', pl: 'Hamak', nl: 'Hangmat', fr: 'Hamac' },
  'Садові меблі':        { en: 'Garden furniture', de: 'Gartenmöbel', cs: 'Zahradní nábytek', pl: 'Meble ogrodowe', nl: 'Tuinmeubilair', fr: 'Mobilier de jardin' },
};

// ─── FAQ ────────────────────────────────────────
const faqTranslations: ContentDict = {
  'Як дістатися до комплексу?':         { en: 'How to get to the complex?', de: 'Wie erreicht man die Anlage?', cs: 'Jak se dostat do areálu?', pl: 'Jak dojechać do kompleksu?', nl: 'Hoe bereikt u het complex?', fr: 'Comment se rendre au complexe ?' },
  'О котрій годині заселення та виселення?': { en: 'What are check-in and check-out times?', de: 'Um wie viel Uhr ist Ein- und Auschecken?', cs: 'V kolik hodin je check-in a check-out?', pl: 'O której godzinie jest zameldowanie i wymeldowanie?', nl: 'Hoe laat is inchecken en uitchecken?', fr: "Quelles sont les heures d'arrivée et de départ ?" },
  'Чи можна з тваринами?':              { en: 'Are pets allowed?', de: 'Sind Haustiere erlaubt?', cs: 'Jsou povolena zvířata?', pl: 'Czy można z zwierzętami?', nl: 'Zijn huisdieren toegestaan?', fr: 'Les animaux sont-ils acceptés ?' },
  'Чи є сніданок?':                     { en: 'Is breakfast included?', de: 'Ist Frühstück inbegriffen?', cs: 'Je součástí snídaně?', pl: 'Czy jest śniadanie?', nl: 'Is ontbijt inbegrepen?', fr: 'Le petit-déjeuner est-il inclus ?' },
  'Де магазин?':                         { en: 'Where is the nearest shop?', de: 'Wo ist der nächste Laden?', cs: 'Kde je nejbližší obchod?', pl: 'Gdzie jest sklep?', nl: 'Waar is de dichtstbijzijnde winkel?', fr: 'Où est le magasin le plus proche ?' },
  'Чи є дитяче ліжечко?':               { en: 'Is a baby crib available?', de: 'Gibt es ein Babybett?', cs: 'Je k dispozici dětská postýlka?', pl: 'Czy jest łóżeczko dla dziecka?', nl: 'Is er een babybedje beschikbaar?', fr: 'Un lit bébé est-il disponible ?' },
  'ALiSiO Resort & Glamping знаходиться в Лугачовіце. GPS: 49.1122°N, 17.7531°E. Від Брно ~1.5 год, від Праги ~3.5 год. Безкоштовна парковка.':
    { en: 'Located in Luhačovice. GPS: 49.1122°N, 17.7531°E. ~1.5h from Brno, ~3.5h from Prague. Free parking.',
      de: 'In Luhačovice gelegen. GPS: 49.1122°N, 17.7531°E. ~1,5 Std. von Brno, ~3,5 Std. von Prag. Kostenfreie Parkplätze.',
      cs: 'Nachází se v Luhačovicích. GPS: 49.1122°N, 17.7531°E. ~1,5 hod od Brna, ~3,5 hod od Prahy. Parkování zdarma.',
      pl: 'Znajduje się w Luhačovicach. GPS: 49.1122°N, 17.7531°E. ~1,5 godz. z Brna, ~3,5 godz. z Pragi. Bezpłatny parking.',
      nl: 'Gelegen in Luhačovice. GPS: 49.1122°N, 17.7531°E. ~1,5u van Brno, ~3,5u van Praag. Gratis parkeren.',
      fr: 'Situé à Luhačovice. GPS: 49.1122°N, 17.7531°E. ~1h30 de Brno, ~3h30 de Prague. Parking gratuit.' },
  'Заселення з 15:00, виселення до 10:00. Ранній заїзд / пізній виїзд за запитом.':
    { en: 'Check-in from 15:00, check-out by 10:00. Early check-in / late check-out on request.',
      de: 'Check-in ab 15:00, Check-out bis 10:00. Früher Check-in / später Check-out auf Anfrage.',
      cs: 'Příjezd od 15:00, odjezd do 10:00. Dřívější příjezd / pozdější odjezd na vyžádání.',
      pl: 'Zameldowanie od 15:00, wymeldowanie do 10:00. Wcześniejsze zameldowanie / późniejsze wymeldowanie na życzenie.',
      nl: 'Inchecken vanaf 15:00, uitchecken vóór 10:00. Vroeg inchecken / laat uitchecken op aanvraag.',
      fr: "Arrivée à partir de 15h00, départ avant 10h00. Arrivée anticipée / départ tardif sur demande." },
  'Так, у деяких типах. 200 CZK/ніч. Повідомте заздалегідь.':
    { en: 'Yes, in some types. 200 CZK/night. Please notify in advance.',
      de: 'Ja, in einigen Typen. 200 CZK/Nacht. Bitte im Voraus mitteilen.',
      cs: 'Ano, u některých typů. 200 CZK/noc. Dejte nám vědět předem.',
      pl: 'Tak, w niektórych typach. 200 CZK/noc. Prosimy o wcześniejsze powiadomienie.',
      nl: 'Ja, bij sommige types. 200 CZK/nacht. Laat het ons vooraf weten.',
      fr: 'Oui, dans certains types. 200 CZK/nuit. Veuillez prévenir à l\'avance.' },
  'Не включено, але можна замовити. Ресторан з 8:00.':
    { en: 'Not included but can be ordered. Restaurant from 8:00.',
      de: 'Nicht inbegriffen, kann aber bestellt werden. Restaurant ab 8:00.',
      cs: 'Není zahrnuta, ale lze objednat. Restaurace od 8:00.',
      pl: 'Nie wliczone, ale można zamówić. Restauracja od 8:00.',
      nl: 'Niet inbegrepen, maar kan besteld worden. Restaurant vanaf 8:00.',
      fr: 'Non inclus mais peut être commandé. Restaurant à partir de 8h00.' },
  'Penny Market / COOP — 5 хв їзди. Базові товари — на рецепції.':
    { en: 'Penny Market / COOP — 5 min drive. Basic supplies at reception.',
      de: 'Penny Market / COOP — 5 Min. Fahrt. Basisartikel an der Rezeption.',
      cs: 'Penny Market / COOP — 5 min jízdy. Základní potřeby na recepci.',
      pl: 'Penny Market / COOP — 5 min jazdy. Podstawowe artykuły w recepcji.',
      nl: 'Penny Market / COOP — 5 min rijden. Basisproducten bij de receptie.',
      fr: 'Penny Market / COOP — 5 min en voiture. Articles de base à la réception.' },
  'Так, безкоштовно за запитом.':
    { en: 'Yes, free of charge on request.',
      de: 'Ja, kostenlos auf Anfrage.',
      cs: 'Ano, zdarma na vyžádání.',
      pl: 'Tak, bezpłatnie na życzenie.',
      nl: 'Ja, gratis op aanvraag.',
      fr: 'Oui, gratuitement sur demande.' },
};

// ─── Rules ──────────────────────────────────────
const rulesTranslations: ContentDict = {
  'Насолоджуйся тишею — не вмикай музику та не галасуй.':
    { en: 'Enjoy the silence — please keep music and noise down.',
      de: 'Genieße die Ruhe — bitte keine laute Musik.',
      cs: 'Užívej si klid — prosím, nezapínej hlasitou hudbu.',
      pl: 'Ciesz się ciszą — nie włączaj głośnej muzyki.',
      nl: 'Geniet van de stilte — houd muziek en lawaai laag.',
      fr: 'Profitez du calme — pas de musique forte.' },
  'Поважай сусідів — зберігай тишу протягом перебування на території.':
    { en: 'Respect your neighbours — keep quiet during your stay.',
      de: 'Respektiere die Nachbarn — halte es während deines Aufenthalts ruhig.',
      cs: 'Respektuj sousedy — udržuj klid na celém areálu.',
      pl: 'Szanuj sąsiadów — zachowaj ciszę podczas pobytu.',
      nl: 'Respecteer je buren — houd het rustig tijdens je verblijf.',
      fr: "Respectez vos voisins — gardez le calme pendant votre séjour." },
  'Не перевищуй швидкість на локації більш ніж 20 км/год.':
    { en: 'Speed limit on site: 20 km/h.',
      de: 'Höchstgeschwindigkeit auf dem Gelände: 20 km/h.',
      cs: 'Maximální rychlost v areálu: 20 km/h.',
      pl: 'Ograniczenie prędkości na terenie: 20 km/h.',
      nl: 'Snelheidslimiet op het terrein: 20 km/u.',
      fr: 'Limite de vitesse sur site : 20 km/h.' },
  'Бережи природу — не залишай їжу та сміття на вулиці.':
    { en: "Take care of nature — don't leave food or rubbish outside.",
      de: 'Schütze die Natur — kein Essen oder Müll im Freien.',
      cs: 'Chraň přírodu — nenechávej jídlo a odpadky venku.',
      pl: 'Dbaj o naturę — nie zostawiaj jedzenia i śmieci na zewnątrz.',
      nl: 'Bescherm de natuur — laat geen eten of afval buiten.',
      fr: 'Protégez la nature — ne laissez ni nourriture ni déchets dehors.' },
  'Шануй ліс — не ламай дерева і не пали дрова з лісу. Їх завжди можна привезти з собою чи придбати у нас.':
    { en: "Respect the forest — don't break trees or burn forest wood. You can bring your own or buy from us.",
      de: 'Schütze den Wald — keine Bäume beschädigen oder Waldholz verbrennen. Holz kann mitgebracht oder bei uns gekauft werden.',
      cs: 'Šetři les — nelámej stromy a nespaluj dřevo z lesa. Můžeš si přivézt vlastní nebo koupit u nás.',
      pl: 'Szanuj las — nie łam drzew i nie pal drewnem z lasu. Możesz przywieźć własne lub kupić u nas.',
      nl: 'Respecteer het bos — breek geen bomen en verbrand geen boshout. U kunt eigen hout meebrengen of bij ons kopen.',
      fr: "Respectez la forêt — ne cassez pas les arbres. Vous pouvez apporter votre bois ou l'acheter chez nous." },
  'Не спалюй сміття в багатті. Для нього у будинку є симпатичний сміттєвий бак.':
    { en: "Don't burn rubbish in the fire. There's a bin inside the house.",
      de: 'Keinen Müll im Feuer verbrennen. Im Haus steht ein Mülleimer.',
      cs: 'Nespaluj odpadky v ohni. V domě je koš na odpadky.',
      pl: 'Nie pal śmieci w ognisku. W domu jest kosz na śmieci.',
      nl: 'Verbrand geen afval in het vuur. Er staat een afvalbak in het huis.',
      fr: "Ne brûlez pas les déchets dans le feu. Il y a une poubelle dans la maison." },
  'Слідкуй за своїми тваринами — ти несеш відповідальність за своїх чотирилапих друзів та шкоду, яку вони можуть завдати.':
    { en: "Watch your pets — you are responsible for your furry friends and any damage they may cause.",
      de: 'Achte auf deine Haustiere — du bist verantwortlich für deine Vierbeiner und mögliche Schäden.',
      cs: 'Sleduj své mazlíčky — neseš odpovědnost za své čtyřnohé kamarády a případné škody.',
      pl: 'Pilnuj swoich zwierząt — odpowiadasz za swoich pupili i ewentualne szkody.',
      nl: 'Let op uw huisdieren — u bent verantwoordelijk voor uw viervoeters en mogelijke schade.',
      fr: 'Surveillez vos animaux — vous êtes responsable de vos compagnons et des dommages éventuels.' },
  'Не пали, будь ласка, в будинку. Оселі мають пахнути свіжістю та лісом.':
    { en: 'No smoking indoors, please. Our houses should smell of fresh air and forest.',
      de: 'Bitte nicht im Haus rauchen. Unsere Häuser sollen nach frischer Luft und Wald riechen.',
      cs: 'Nekuřte prosím v domě. Naše domy mají vonět svěžestí a lesem.',
      pl: 'Nie pal w domu. Nasze domki powinny pachnieć świeżością i lasem.',
      nl: 'Niet roken binnenshuis. Onze huizen moeten naar frisse lucht en bos ruiken.',
      fr: "Ne fumez pas à l'intérieur. Nos maisons doivent sentir l'air frais et la forêt." },
  'Залишай чистоту — щоб наступні гості теж відчули затишок.':
    { en: 'Leave it clean — so the next guests feel welcome too.',
      de: 'Hinterlasse es sauber — damit sich auch die nächsten Gäste wohlfühlen.',
      cs: 'Nech to čisté — aby se i další hosté cítili příjemně.',
      pl: 'Zostaw czystość — aby następni goście też poczuli się jak w domu.',
      nl: 'Laat het schoon achter — zodat de volgende gasten zich ook welkom voelen.',
      fr: 'Laissez propre — pour que les prochains invités se sentent aussi bienvenus.' },
  'Тиша після 22:00': { en: 'Quiet hours after 22:00', de: 'Ruhezeit ab 22:00', cs: 'Klid po 22:00', pl: 'Cisza po 22:00', nl: 'Stilte na 22:00', fr: 'Silence après 22h00' },
  'Заборонено палити в приміщеннях': { en: 'No smoking indoors', de: 'Rauchen im Gebäude verboten', cs: 'Zákaz kouření v budově', pl: 'Zakaz palenia wewnątrz', nl: 'Niet roken binnenshuis', fr: 'Interdiction de fumer à l\'intérieur' },
  'Розпалювання вогню лише у відведених місцях': { en: 'Fires only in designated areas', de: 'Feuer nur an ausgewiesenen Stellen', cs: 'Oheň pouze na vyhrazených místech', pl: 'Ogień tylko w wyznaczonych miejscach', nl: 'Vuur alleen op aangewezen plaatsen', fr: 'Feu uniquement aux emplacements désignés' },
  'Швидкість по території не більше 10 км/год': { en: 'Speed limit 10 km/h on premises', de: 'Höchstgeschwindigkeit 10 km/h auf dem Gelände', cs: 'Max. rychlost 10 km/h', pl: 'Limit prędkości 10 km/h', nl: 'Max. snelheid 10 km/u', fr: 'Vitesse max. 10 km/h' },
  'Сміття — сортуйте та виносьте': { en: 'Sort and dispose of waste', de: 'Müll sortieren und entsorgen', cs: 'Třiďte a vynášejte odpad', pl: 'Sortuj i wynoś śmieci', nl: 'Afval scheiden en weggooien', fr: 'Triez et jetez les déchets' },
  'Тварини на повідку, прибирати за ними': { en: 'Pets on leash, clean up after them', de: 'Tiere an der Leine, bitte aufräumen', cs: 'Zvířata na vodítku, uklízejte po nich', pl: 'Zwierzęta na smyczy, sprzątaj po nich', nl: 'Dieren aan de lijn, ruim op', fr: 'Animaux en laisse, ramassez après eux' },
  'Купіль та сауна — за попереднім записом': { en: 'Plunge pool & sauna — by appointment', de: 'Tauchbecken & Sauna — nach Vereinbarung', cs: 'Bazén a sauna — po předchozí rezervaci', pl: 'Kąpiel i sauna — po wcześniejszej rezerwacji', nl: 'Dompelbad & sauna — op afspraak', fr: 'Bain froid et sauna — sur réservation' },
  'При виїзді поверніть ключі на рецепцію': { en: 'Return keys to reception at check-out', de: 'Schlüssel bei Abreise an der Rezeption abgeben', cs: 'Při odjezdu vraťte klíče na recepci', pl: 'Przy wymeldowaniu oddaj klucze w recepcji', nl: 'Retourneer sleutels bij de receptie bij het uitchecken', fr: 'Rendez les clés à la réception au départ' },
};

// ─── Useful Info ────────────────────────────────
const usefulInfoTranslations: ContentDict = {
  'Магазини':            { en: 'Shops', de: 'Geschäfte', cs: 'Obchody', pl: 'Sklepy', nl: 'Winkels', fr: 'Magasins' },
  'Аптека та лікарня':   { en: 'Pharmacy & hospital', de: 'Apotheke & Krankenhaus', cs: 'Lékárna a nemocnice', pl: 'Apteka i szpital', nl: 'Apotheek & ziekenhuis', fr: 'Pharmacie & hôpital' },
  'Пішохідні маршрути':  { en: 'Hiking trails', de: 'Wanderwege', cs: 'Pěší trasy', pl: 'Szlaki piesze', nl: 'Wandelroutes', fr: 'Sentiers de randonnée' },
  'Велосипедні маршрути': { en: 'Cycling routes', de: 'Radwege', cs: 'Cyklostezky', pl: 'Trasy rowerowe', nl: 'Fietsroutes', fr: 'Pistes cyclables' },
  'Курортна зона':       { en: 'Spa area', de: 'Kurgebiet', cs: 'Lázeňská zóna', pl: 'Strefa uzdrowiskowa', nl: 'Kuuroord', fr: 'Zone thermale' },
  'Екскурсії':           { en: 'Excursions', de: 'Ausflüge', cs: 'Výlety', pl: 'Wycieczki', nl: 'Excursies', fr: 'Excursions' },
  'Penny Market та COOP — 5 хв їзди.':
    { en: 'Penny Market and COOP — 5 min drive.', de: 'Penny Market und COOP — 5 Min. Fahrt.', cs: 'Penny Market a COOP — 5 min jízdy.', pl: 'Penny Market i COOP — 5 min jazdy.', nl: 'Penny Market en COOP — 5 min rijden.', fr: 'Penny Market et COOP — 5 min en voiture.' },
  'Аптека в центрі (5 хв). Лікарня — Злін (25 хв).':
    { en: 'Pharmacy in center (5 min). Hospital — Zlín (25 min).', de: 'Apotheke im Zentrum (5 Min.). Krankenhaus — Zlín (25 Min.).', cs: 'Lékárna v centru (5 min). Nemocnice — Zlín (25 min).', pl: 'Apteka w centrum (5 min). Szpital — Zlín (25 min).', nl: 'Apotheek in centrum (5 min). Ziekenhuis — Zlín (25 min).', fr: 'Pharmacie au centre (5 min). Hôpital — Zlín (25 min).' },
  'Маршрути прямо від комплексу. Карти на рецепції.':
    { en: 'Trails right from the complex. Maps at reception.', de: 'Wanderwege direkt ab der Anlage. Karten an der Rezeption.', cs: 'Trasy přímo od areálu. Mapy na recepci.', pl: 'Trasy prosto z kompleksu. Mapy w recepcji.', nl: 'Routes direct vanaf het complex. Kaarten bij de receptie.', fr: 'Sentiers depuis le complexe. Cartes à la réception.' },
  'Велодоріжки вздовж річки. Оренда на рецепції.':
    { en: 'Bike paths along the river. Rental at reception.', de: 'Radwege entlang des Flusses. Verleih an der Rezeption.', cs: 'Cyklostezky podél řeky. Půjčovna na recepci.', pl: 'Ścieżki rowerowe wzdłuż rzeki. Wypożyczalnia w recepcji.', nl: 'Fietspaden langs de rivier. Verhuur bij de receptie.', fr: 'Pistes cyclables le long de la rivière. Location à la réception.' },
  'Лугачовіце — курорт з мінеральними джерелами.':
    { en: 'Luhačovice — a spa town with mineral springs.', de: 'Luhačovice — ein Kurort mit Mineralquellen.', cs: 'Luhačovice — lázně s minerálními prameny.', pl: 'Luhačovice — uzdrowisko ze źródłami mineralnymi.', nl: 'Luhačovice — een kuuroord met minerale bronnen.', fr: 'Luhačovice — une ville thermale avec des sources minérales.' },
  'Замок Бухлов, зоопарк Лешна. Запитуйте на рецепції.':
    { en: 'Buchlov Castle, Lešná Zoo. Ask at reception.', de: 'Burg Buchlov, Zoo Lešná. Fragen Sie an der Rezeption.', cs: 'Zámek Buchlov, ZOO Lešná. Ptejte se na recepci.', pl: 'Zamek Buchlov, zoo Lešná. Pytaj w recepcji.', nl: 'Kasteel Buchlov, Lešná Zoo. Vraag bij de receptie.', fr: 'Château de Buchlov, zoo Lešná. Demandez à la réception.' },
};

// ─── Services ───────────────────────────────────
const serviceTranslations: ContentDict = {
  'Сніданок':           { en: 'Breakfast', de: 'Frühstück', cs: 'Snídaně', pl: 'Śniadanie', nl: 'Ontbijt', fr: 'Petit-déjeuner' },
  'Сауна':              { en: 'Sauna', de: 'Sauna', cs: 'Sauna', pl: 'Sauna', nl: 'Sauna', fr: 'Sauna' },
  'Купіль':             { en: 'Plunge pool', de: 'Tauchbecken', cs: 'Studená lázeň', pl: 'Kąpiel', nl: 'Dompelbad', fr: 'Bain froid' },
  'Велосипед':          { en: 'Bicycle', de: 'Fahrrad', cs: 'Kolo', pl: 'Rower', nl: 'Fiets', fr: 'Vélo' },
  'Електровелосипед':   { en: 'E-Bike', de: 'E-Bike', cs: 'Elektrokolo', pl: 'Rower elektryczny', nl: 'E-fiets', fr: 'Vélo électrique' },
  'SUP борд':           { en: 'SUP Board', de: 'SUP Board', cs: 'SUP prkno', pl: 'Deska SUP', nl: 'SUP Board', fr: 'Planche SUP' },
  'Мангал':             { en: 'BBQ Grill', de: 'Grillset', cs: 'Gril', pl: 'Grill', nl: 'BBQ', fr: 'Barbecue' },
  'Паркінг VIP':        { en: 'VIP Parking', de: 'VIP Parkplatz', cs: 'VIP parkování', pl: 'Parking VIP', nl: 'VIP Parking', fr: 'Parking VIP' },
  'Пізній виїзд':       { en: 'Late check-out', de: 'Später Check-out', cs: 'Pozdní check-out', pl: 'Późne wymeldowanie', nl: 'Laat uitchecken', fr: 'Départ tardif' },
  'Ранній заїзд':       { en: 'Early check-in', de: 'Früher Check-in', cs: 'Dřívější příjezd', pl: 'Wczesne zameldowanie', nl: 'Vroeg inchecken', fr: 'Arrivée anticipée' },
  'Дрова':              { en: 'Firewood', de: 'Brennholz', cs: 'Dřevo na oheň', pl: 'Drewno opałowe', nl: 'Brandhout', fr: 'Bois de chauffage' },
  'Трансфер':           { en: 'Transfer', de: 'Transfer', cs: 'Transfer', pl: 'Transfer', nl: 'Transfer', fr: 'Transfert' },
  'Повноцінний сніданок у ресторані':    { en: 'Full breakfast in restaurant', de: 'Vollständiges Frühstück im Restaurant', cs: 'Plná snídaně v restauraci', pl: 'Pełne śniadanie w restauracji', nl: 'Volledig ontbijt in restaurant', fr: 'Petit-déjeuner complet au restaurant' },
  'Фінська сауна (2 години)':           { en: 'Finnish sauna (2 hours)', de: 'Finnische Sauna (2 Stunden)', cs: 'Finská sauna (2 hodiny)', pl: 'Sauna fińska (2 godziny)', nl: 'Finse sauna (2 uur)', fr: 'Sauna finlandais (2 heures)' },
  'Холодна купіль після сауни':         { en: 'Cold plunge after sauna', de: 'Kaltes Tauchbecken nach der Sauna', cs: 'Studená lázeň po sauně', pl: 'Zimna kąpiel po saunie', nl: 'Koud dompelbad na sauna', fr: 'Bain froid après sauna' },
  'Оренда велосипеда на день':          { en: 'Bicycle rental per day', de: 'Fahrradverleih pro Tag', cs: 'Pronájem kola na den', pl: 'Wynajem roweru na dzień', nl: 'Fietsverhuur per dag', fr: 'Location de vélo par jour' },
  'Оренда електровелосипеда на день':   { en: 'E-bike rental per day', de: 'E-Bike-Verleih pro Tag', cs: 'Pronájem elektrokola na den', pl: 'Wynajem e-roweru na dzień', nl: 'E-fietsverhuur per dag', fr: 'Location de vélo électrique par jour' },
  'Оренда SUP борду':                   { en: 'SUP board rental', de: 'SUP Board Verleih', cs: 'Pronájem SUP prkna', pl: 'Wynajem deski SUP', nl: 'SUP Board verhuur', fr: 'Location de planche SUP' },
  'Набір для барбекю з вугіллям':        { en: 'BBQ set with charcoal', de: 'Grillset mit Kohle', cs: 'Grilovací set s uhlím', pl: 'Zestaw grillowy z węglem', nl: 'BBQ set met houtskool', fr: 'Kit barbecue avec charbon' },
  'Закрите паркомісце біля будівлі':     { en: 'Covered parking near building', de: 'Überdachter Parkplatz nahe dem Gebäude', cs: 'Kryté parkování u budovy', pl: 'Zadaszone miejsce parkingowe przy budynku', nl: 'Overdekte parkeerplaats bij het gebouw', fr: 'Parking couvert près du bâtiment' },
  'за особу/день':      { en: 'per person/day', de: 'pro Person/Tag', cs: 'za os./den', pl: 'za os./dzień', nl: 'per pers./dag', fr: 'par pers./jour' },
  'за сеанс':           { en: 'per session', de: 'pro Sitzung', cs: 'za sezení', pl: 'za sesję', nl: 'per sessie', fr: 'par séance' },
  'за день':            { en: 'per day', de: 'pro Tag', cs: 'za den', pl: 'za dzień', nl: 'per dag', fr: 'par jour' },
  'за годину':          { en: 'per hour', de: 'pro Stunde', cs: 'za hodinu', pl: 'za godzinę', nl: 'per uur', fr: "par heure" },
  'за раз':             { en: 'per use', de: 'pro Nutzung', cs: 'za použití', pl: 'za użycie', nl: 'per keer', fr: 'par utilisation' },
  'за ніч':             { en: 'per night', de: 'pro Nacht', cs: 'za noc', pl: 'za noc', nl: 'per nacht', fr: 'par nuit' },
};

// ─── Restaurant ─────────────────────────────────
const restaurantTranslations: ContentDict = {
  'Ресторан ALiSiO':    { en: 'ALiSiO Restaurant', de: 'Restaurant ALiSiO', cs: 'Restaurace ALiSiO', pl: 'Restauracja ALiSiO', nl: 'Restaurant ALiSiO', fr: 'Restaurant ALiSiO' },
  'Ресторан':           { en: 'Restaurant', de: 'Restaurant', cs: 'Restaurace', pl: 'Restauracja', nl: 'Restaurant', fr: 'Restaurant' },
  '📅 Щодня: 8:00 – 22:00\n🍳 Сніданок: 8:00 – 10:30\n🥘 Обід: 12:00 – 15:00\n🍷 Вечеря: 18:00 – 22:00':
    { en: '📅 Daily: 8:00 – 22:00\n🍳 Breakfast: 8:00 – 10:30\n🥘 Lunch: 12:00 – 15:00\n🍷 Dinner: 18:00 – 22:00',
      de: '📅 Täglich: 8:00 – 22:00\n🍳 Frühstück: 8:00 – 10:30\n🥘 Mittagessen: 12:00 – 15:00\n🍷 Abendessen: 18:00 – 22:00',
      cs: '📅 Denně: 8:00 – 22:00\n🍳 Snídaně: 8:00 – 10:30\n🥘 Oběd: 12:00 – 15:00\n🍷 Večeře: 18:00 – 22:00',
      pl: '📅 Codziennie: 8:00 – 22:00\n🍳 Śniadanie: 8:00 – 10:30\n🥘 Obiad: 12:00 – 15:00\n🍷 Kolacja: 18:00 – 22:00',
      nl: '📅 Dagelijks: 8:00 – 22:00\n🍳 Ontbijt: 8:00 – 10:30\n🥘 Lunch: 12:00 – 15:00\n🍷 Diner: 18:00 – 22:00',
      fr: '📅 Tous les jours: 8h00 – 22h00\n🍳 Petit-déjeuner: 8h00 – 10h30\n🥘 Déjeuner: 12h00 – 15h00\n🍷 Dîner: 18h00 – 22h00' },
};

// ─── Check-in Instructions ──────────────────────
const checkInTranslations: ContentDict = {
  'Зустріч на рецепції. Ми покажемо ваш будиночок та розкажемо про територію.':
    { en: 'Meet at reception. We will show you your cabin and explain the grounds.',
      de: 'Treffen Sie sich an der Rezeption. Wir zeigen Ihnen Ihr Haus und erklären das Gelände.',
      cs: 'Sejdeme se na recepci. Ukážeme vám váš domek a provedeme po areálu.',
      pl: 'Spotkanie w recepcji. Pokażemy Ci domek i opowiemy o terenie.',
      nl: 'Ontmoeting bij de receptie. We laten u uw huisje zien en leggen het terrein uit.',
      fr: "Rendez-vous à la réception. Nous vous montrerons votre chalet et le terrain." },
  'Зареєструйтесь на рецепції, вам покажуть ваше місце та видадуть картку доступу до санітарного блоку.':
    { en: 'Register at reception — they will show your pitch and give you a sanitary block access card.',
      de: 'Melden Sie sich an der Rezeption — man zeigt Ihnen Ihren Platz und gibt Ihnen eine Zutrittskarte für den Sanitärbereich.',
      cs: 'Zaregistrujte se na recepci — ukážou vám vaše místo a dají vám přístupovou kartu k sanitárnímu bloku.',
      pl: 'Zarejestruj się w recepcji — pokażą Ci miejsce i wydadzą kartę dostępu do sanitariatów.',
      nl: 'Meld u aan bij de receptie — u krijgt uw plek te zien en een toegangskaart voor het sanitairblok.',
      fr: "Inscrivez-vous à la réception — on vous montrera votre emplacement et vous recevrez une carte d'accès au bloc sanitaire." },
  'Зустріч на рецепції будови. Ключі та інструктаж на місці.':
    { en: 'Meet at building reception. Keys and briefing on site.',
      de: 'Treffen an der Gebäuderezeption. Schlüssel und Einweisung vor Ort.',
      cs: 'Sejdeme se na recepci budovy. Klíče a instrukce na místě.',
      pl: 'Spotkanie w recepcji budynku. Klucze i instrukcje na miejscu.',
      nl: 'Ontmoeting bij de receptie van het gebouw. Sleutels en instructies ter plaatse.',
      fr: "Rendez-vous à la réception du bâtiment. Clés et instructions sur place." },
};

// ─── Merge all dictionaries ─────────────────────
const ALL_DICTS: ContentDict = {
  ...amenityNames,
  ...faqTranslations,
  ...rulesTranslations,
  ...usefulInfoTranslations,
  ...serviceTranslations,
  ...restaurantTranslations,
  ...checkInTranslations,
};

/**
 * Translate a Ukrainian content string to the target language using the static dictionary.
 * Returns the original text if no translation is found or lang is 'uk'.
 * Text is trimmed before lookup to handle whitespace inconsistencies.
 */
export function translateContent(text: string, lang: string): string {
  if (!text || lang === 'uk') return text;
  const trimmed = text.trim();
  const entry = ALL_DICTS[trimmed];
  if (entry && entry[lang]) return entry[lang];
  return text;
}
