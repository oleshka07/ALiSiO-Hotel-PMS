/**
 * ALiSiO PMS — Embeddable Booking Widget
 * Usage: <div id="alisio-booking-widget"></div>
 *        <script src="https://your-pms.com/widget/embed.js" data-property="PROP_ID" data-lang="en"></script>
 */
(function() {
  'use strict';

  // ─── Config from script tag ───
  const scriptTag = document.currentScript || document.querySelector('script[data-property]');
  const API_BASE      = scriptTag ? (scriptTag.getAttribute('data-api') || scriptTag.src.replace(/\/widget\/embed\.js.*$/, '')) : '';
  const PROPERTY_ID   = scriptTag ? (scriptTag.getAttribute('data-property') || '') : '';
  const UNIT_ID       = scriptTag ? (scriptTag.getAttribute('data-unit') || '') : '';
  const UNIT_TYPE_ID  = scriptTag ? (scriptTag.getAttribute('data-unit-type') || '') : '';
  const SITE_ID       = scriptTag ? (scriptTag.getAttribute('data-site') || '') : '';
  const LANG          = scriptTag ? (scriptTag.getAttribute('data-lang') || (window.__BOOKING_LANG__) || 'en') : 'en';
  const ACCENT        = scriptTag ? (scriptTag.getAttribute('data-color') || '#e61e4d') : '#e61e4d';
  const SHOW_AVAIL_CAL = !!(UNIT_ID || UNIT_TYPE_ID); // show inline avail calendar for unit embeds

  // ─── i18n ───
  const T = {
    en: { total:'Total', arrival:'CHECK-IN', departure:'CHECK-OUT', guests:'guests', guest:'guest',
      adults:'Adults', children:'Children', book:'Book Now', noCharge:'You won\'t be charged yet',
      freeCancel:'Free cancellation', nights:'nights', night:'night', perNight:'/night',
      clearDates:'Clear dates', close:'Close',
      firstName:'First Name', lastName:'Last Name', phone:'Phone', email:'Email',
      bookingSummary:'Booking Summary', house:'House', price:'Price', totalLabel:'Total',
      guestInfo:'Guest Information', confirmBook:'Confirm Booking', back:'Back', next:'Next',
      success:'Booking Confirmed!', successMsg:'We will contact you to confirm payment.',
      bookingId:'Booking ID', selectDates:'Select your dates',
      mon:'Mo',tue:'Tu',wed:'We',thu:'Th',fri:'Fr',sat:'Sa',sun:'Su',
      months:['January','February','March','April','May','June','July','August','September','October','November','December'],
      selectHouse:'Select accommodation', available:'available', noAvail:'No availability for selected dates',
      errorOccurred:'An error occurred', required:'required', loading:'Loading...',
      checkPrice:'Check Price', promoCode:'Promo code', promoApply:'Apply', promoApplied:'Applied ✓',
      promoInvalid:'Invalid promo code', promoRemove:'Remove', discount:'Discount',
      proceedToBook:'Proceed to Booking', changeDates:'Change dates', priceFor:'Price for',
      subtotal:'Subtotal', total2:'Total', perNightAvg:'avg/night' },
    uk: { total:'Усього', arrival:'ПРИБУТТЯ', departure:'ВИЇЗД', guests:'гостей', guest:'гість',
      adults:'Дорослі', children:'Діти', book:'Забронювати', noCharge:'Поки що ви нічого не платите',
      freeCancel:'Безкоштовне скасування', nights:'ночей', night:'ніч', perNight:'/ніч',
      clearDates:'Очистити дати', close:'Закрити',
      firstName:'Ім\'я', lastName:'Прізвище', phone:'Телефон', email:'Email',
      bookingSummary:'Підсумок бронювання', house:'Будинок', price:'Ціна', totalLabel:'Усього',
      guestInfo:'Інформація про гостя', confirmBook:'Підтвердити бронювання', back:'Назад', next:'Далі',
      success:'Бронювання підтверджено!', successMsg:'Ми зв\'яжемося з вами для підтвердження оплати.',
      bookingId:'Номер бронювання', selectDates:'Оберіть дати',
      mon:'Пн',tue:'Вт',wed:'Ср',thu:'Чт',fri:'Пт',sat:'Сб',sun:'Нд',
      months:['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
      selectHouse:'Оберіть помешкання', available:'вільних', noAvail:'Немає вільних місць на обрані дати',
      errorOccurred:'Виникла помилка', required:'обов\'язково', loading:'Завантаження...',
      checkPrice:'Дізнатись ціну', promoCode:'Промокод', promoApply:'Застосувати', promoApplied:'Застосовано ✓',
      promoInvalid:'Невірний промокод', promoRemove:'Видалити', discount:'Знижка',
      proceedToBook:'Перейти до бронювання', changeDates:'Змінити дати', priceFor:'Ціна за',
      subtotal:'Сума', total2:'Усього', perNightAvg:'сер./ніч' },
    cs: { total:'Celkem', arrival:'PŘÍJEZD', departure:'ODJEZD', guests:'hostů', guest:'host',
      adults:'Dospělí', children:'Děti', book:'Rezervovat', noCharge:'Zatím nic neplatíte',
      freeCancel:'Bezplatné storno', nights:'nocí', night:'noc', perNight:'/noc',
      clearDates:'Vymazat data', close:'Zavřít',
      firstName:'Jméno', lastName:'Příjmení', phone:'Telefon', email:'Email',
      bookingSummary:'Souhrn rezervace', house:'Dům', price:'Cena', totalLabel:'Celkem',
      guestInfo:'Informace o hostovi', confirmBook:'Potvrdit rezervaci', back:'Zpět', next:'Další',
      success:'Rezervace potvrzena!', successMsg:'Budeme vás kontaktovat k potvrzení platby.',
      bookingId:'Číslo rezervace', selectDates:'Vyberte data',
      mon:'Po',tue:'Út',wed:'St',thu:'Čt',fri:'Pá',sat:'So',sun:'Ne',
      months:['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'],
      selectHouse:'Vyberte ubytování', available:'volných', noAvail:'Žádná dostupnost pro vybraná data',
      errorOccurred:'Došlo k chybě', required:'povinné', loading:'Načítání...',
      checkPrice:'Zjistit cenu', promoCode:'Promo kód', promoApply:'Použít', promoApplied:'Aplikováno ✓',
      promoInvalid:'Neplatný kód', promoRemove:'Odebrat', discount:'Sleva',
      proceedToBook:'Přejít k rezervaci', changeDates:'Změnit data', priceFor:'Cena za',
      subtotal:'Mezisouček', total2:'Celkem', perNightAvg:'prům./noc' }
  };
  const t = T[LANG] || T.en;

  // ─── i18n extra keys ───
  const TExtra = {
    en: { availCal:'Availability Calendar', booked:'Booked', available:'Available', today:'Today' },
    uk: { availCal:'Календар зайнятості',   booked:'Зайнято', available:'Вільно',   today:'Сьогодні' },
    cs: { availCal:'Kalendář obsazenosti',  booked:'Obsazeno', available:'Volné',   today:'Dnes' },
    de: { availCal:'Verfügbarkeitskalender', booked:'Belegt', available:'Verfügbar', today:'Heute' },
  };
  const tx = TExtra[LANG] || TExtra.en;

  // ─── State ───
  let state = {
    checkIn: null, checkOut: null, adults: 2, children: 0,
    totalPrice: 0, currency: 'CZK', unitTypes: [], selectedUnitTypeId: null,
    calendarOpen: false, calMonthOffset: 0, calendarData: {},
    guestsOpen: false, modalOpen: false, modalStep: 1,
    selectingCheckOut: false, availability: null,
    firstName: '', lastName: '', phone: '', email: '',
    loading: false, error: null, reservation: null, propertyName: '',
    // Availability calendar (inline, unit-specific)
    availCalOffset: 0, bookedDates: new Set(), availLoaded: false,
    // 2-stage widget
    widgetStep: 1,   // 1 = form, 2 = price shown
    promo: { code: '', open: false, applied: false, discountType: null, discountValue: null, error: null },
    basePrice: 0, finalPrice: 0,
  };

  // ─── DOM ───
  const CONTAINER_ID = (scriptTag && scriptTag.getAttribute('data-container')) || 'alisio-booking-widget';
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  const shadow = container.attachShadow({ mode: 'open' });

  // Load CSS
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = API_BASE + '/widget/embed.css';
  shadow.appendChild(cssLink);

  // Override accent color
  const accentStyle = document.createElement('style');
  accentStyle.textContent = `.aw-book-btn{background:linear-gradient(to right,${ACCENT},${ACCENT}cc)!important}`;
  shadow.appendChild(accentStyle);

  const root = document.createElement('div');
  shadow.appendChild(root);

  // ─── Helpers ───
  function fmtDate(d) { return d.toISOString().split('T')[0]; }
  function parseDate(s) { return new Date(s + 'T00:00:00'); }
  function fmtDisplay(s) {
    var d = parseDate(s);
    return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
  }
  function fmtPrice(n) { return new Intl.NumberFormat('cs-CZ').format(n); }
  function getNights() {
    if (!state.checkIn || !state.checkOut) return 0;
    return Math.round((parseDate(state.checkOut) - parseDate(state.checkIn)) / 86400000);
  }
  function nightsWord(n) { return n === 1 ? t.night : t.nights; }
  function guestsWord(n) { return n === 1 ? t.guest : t.guests; }
  function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
  function getFirstDayMon(y, m) { var d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

  // ─── Pixel / Analytics Events ───
  // Called at key booking funnel moments.
  // Works with: Facebook Pixel (fbq), GA4 (dataLayer), TikTok (ttq), PostMessage, Custom callback.
  //
  // Usage from parent page:
  //   window.alisioOnEvent = function(event, data) { ... your tracking code ... }
  //   OR use standard pixels — they are called automatically.
  //
  // Events fired:
  //   'CheckPrice'        — user clicked "Дізнатись ціну" (dates + guests chosen)
  //   'PriceViewed'       — price shown (step 2 reached)
  //   'InitiateCheckout'  — user clicked "Перейти до бронювання"
  //   'Purchase'          — booking confirmed (success screen)
  //   'PromoApplied'      — promo code successfully applied
  function trackEvent(eventName, data) {
    var payload = Object.assign({
      widget: 'alisio',
      site_id: SITE_ID || PROPERTY_ID,
      unit_id: UNIT_ID || undefined,
      currency: state.currency,
      check_in: state.checkIn,
      check_out: state.checkOut,
      nights: getNights(),
      guests: state.adults + state.children,
    }, data || {});

    // 1. Custom callback on parent window
    if (typeof window.alisioOnEvent === 'function') {
      try { window.alisioOnEvent(eventName, payload); } catch(e) {}
    }

    // 2. Facebook Pixel
    if (typeof window.fbq === 'function') {
      var fbMap = {
        CheckPrice:       ['track', 'Search', { currency: payload.currency, num_adults: state.adults }],
        PriceViewed:      ['track', 'ViewContent', { content_type: 'product', value: payload.value, currency: payload.currency }],
        InitiateCheckout: ['track', 'InitiateCheckout', { value: payload.value, currency: payload.currency, num_items: 1 }],
        Purchase:         ['track', 'Purchase', { value: payload.value, currency: payload.currency }],
        PromoApplied:     ['trackCustom', 'PromoCodeApplied', { promo: payload.promo_code }],
      };
      var args = fbMap[eventName];
      if (args) { try { window.fbq.apply(window, args); } catch(e) {} }
    }

    // 3. Google Analytics 4 / GTM dataLayer
    if (Array.isArray(window.dataLayer)) {
      var gaMap = {
        CheckPrice:       { event: 'search', search_term: (state.checkIn + '_' + state.checkOut) },
        PriceViewed:      { event: 'view_item', value: payload.value, currency: payload.currency, items: [{ item_id: UNIT_ID||UNIT_TYPE_ID||PROPERTY_ID }] },
        InitiateCheckout: { event: 'begin_checkout', value: payload.value, currency: payload.currency },
        Purchase:         { event: 'purchase', transaction_id: payload.reservation_id, value: payload.value, currency: payload.currency },
        PromoApplied:     { event: 'select_promotion', promotion_name: payload.promo_code },
      };
      var gaEvt = gaMap[eventName];
      if (gaEvt) { try { window.dataLayer.push(gaEvt); } catch(e) {} }
    }

    // 4. TikTok Pixel
    if (typeof window.ttq !== 'undefined' && typeof window.ttq.track === 'function') {
      var ttMap = {
        CheckPrice:       ['Search', {}],
        PriceViewed:      ['ViewContent', { content_id: UNIT_ID||UNIT_TYPE_ID, value: payload.value, currency: payload.currency }],
        InitiateCheckout: ['InitiateCheckout', { value: payload.value, currency: payload.currency }],
        Purchase:         ['CompletePayment', { value: payload.value, currency: payload.currency }],
      };
      var ttArgs = ttMap[eventName];
      if (ttArgs) { try { window.ttq.track(ttArgs[0], ttArgs[1]); } catch(e) {} }
    }

    // 5. postMessage to parent (for iframes or custom listeners)
    try {
      window.parent.postMessage({ source: 'alisio-widget', event: eventName, data: payload }, '*');
    } catch(e) {}
  }

  // ─── API calls ───
  async function loadConfig() {
    try {
      var url = API_BASE + '/api/widget/config' + (PROPERTY_ID ? '?propertyId=' + PROPERTY_ID : '');
      var res = await fetch(url);
      var data = await res.json();
      state.propertyName = data.property.name;
      state.currency = data.property.currency;
      state.unitTypes = data.unitTypes;
      if (data.defaults.checkIn) {
        state.checkIn = data.defaults.checkIn;
        state.checkOut = data.defaults.checkOut;
        state.totalPrice = data.defaults.totalPrice;
        state.selectedUnitTypeId = data.defaults.unitTypeId;
      }
      render();
    } catch(e) { console.error('ALiSiO Widget: config error', e); }
  }

  async function loadUnitAvailability() {
    if (!UNIT_ID && !UNIT_TYPE_ID) return;
    try {
      var params = UNIT_ID ? 'unit_id=' + UNIT_ID : 'unit_type_id=' + UNIT_TYPE_ID;
      if (SITE_ID) params += '&site_id=' + SITE_ID;
      var res = await fetch(API_BASE + '/api/public/availability?' + params);
      var data = await res.json();
      if (data.bookedDates) {
        state.bookedDates = new Set(data.bookedDates);
        // Also populate calendarData for the date-picker calendar
        data.bookedDates.forEach(function(ds) {
          var ym = ds.substring(0, 7);
          if (!state.calendarData[ym]) state.calendarData[ym] = {};
          state.calendarData[ym][ds] = { date: ds, status: 'booked' };
        });
      }
      state.availLoaded = true;
      render();
    } catch(e) { console.error('ALiSiO Widget: availability error', e); }
  }

  async function loadCalendar(yearMonth) {
    if (state.calendarData[yearMonth]) return;
    try {
      var url = API_BASE + '/api/widget/calendar?month=' + yearMonth + (PROPERTY_ID ? '&propertyId=' + PROPERTY_ID : '');
      var res = await fetch(url);
      var data = await res.json();
      state.calendarData[yearMonth] = {};
      data.days.forEach(function(d) { state.calendarData[yearMonth][d.date] = d; });
      render();
    } catch(e) { console.error('ALiSiO Widget: calendar error', e); }
  }

  async function loadAvailability() {
    if (!state.checkIn || !state.checkOut) return;
    state.loading = true; state.error = null; render();
    try {
      var url = API_BASE + '/api/booking/availability?checkIn=' + state.checkIn + '&checkOut=' + state.checkOut;
      var res = await fetch(url);
      var data = await res.json();
      state.availability = data;
      // Update total price from availability
      if (data.unitTypes && data.unitTypes.length > 0) {
        var sel = state.selectedUnitTypeId ? data.unitTypes.find(function(u){return u.id===state.selectedUnitTypeId}) : null;
        if (!sel) sel = data.unitTypes.find(function(u){return u.availableCount>0});
        if (sel) { state.totalPrice = sel.totalPrice; state.selectedUnitTypeId = sel.id; }
      }
    } catch(e) { state.error = t.errorOccurred; }
    state.loading = false; render();
  }

  async function submitReservation() {
    state.loading = true; state.error = null; render();
    try {
      var bodyData = {
        unitTypeId: state.selectedUnitTypeId, checkIn: state.checkIn, checkOut: state.checkOut,
        adults: state.adults, children: state.children,
        firstName: state.firstName.trim(), lastName: state.lastName.trim(),
        email: state.email.trim() || undefined, phone: state.phone.trim()
      };
      if (UNIT_ID) bodyData.unitId = UNIT_ID;
      if (SITE_ID) bodyData.siteId = SITE_ID;
      if (state.promo.applied && state.promo.code) bodyData.couponCode = state.promo.code;

      var res = await fetch(API_BASE + '/api/booking/reserve', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(bodyData)
      });
      if (!res.ok) { var err = await res.json(); throw new Error(err.error || 'Failed'); }
      var data = await res.json();
      state.reservation = data; state.modalStep = 3;
      trackEvent('Purchase', { value: state.finalPrice, reservation_id: data.reservationId });
    } catch(e) { state.error = e.message || t.errorOccurred; }
    state.loading = false; render();
  }

  async function applyPromo() {
    var code = state.promo.code.trim().toUpperCase();
    if (!code) return;
    try {
      var params = 'code=' + encodeURIComponent(code);
      if (SITE_ID) params += '&siteId=' + SITE_ID;
      if (UNIT_ID) params += '&unitId=' + UNIT_ID;
      var res = await fetch(API_BASE + '/api/booking/activate?' + params);
      var data = await res.json();
      if (res.ok && data.valid && data.discount_type) {
        state.promo.applied = true;
        state.promo.discountType = data.discount_type;
        state.promo.discountValue = data.offer_amount;
        state.promo.error = null;
        calcFinalPrice();
        trackEvent('PromoApplied', { promo_code: state.promo.code, value: state.finalPrice });
      } else {
        state.promo.error = data.error || t.promoInvalid;
        state.promo.applied = false;
      }
    } catch(e) { state.promo.error = t.errorOccurred; }
    render();
  }

  function calcFinalPrice() {
    var base = state.basePrice;
    if (state.promo.applied && state.promo.discountType) {
      if (state.promo.discountType === 'percentage') {
        state.finalPrice = Math.round(base * (1 - state.promo.discountValue / 100));
      } else {
        state.finalPrice = Math.max(0, base - state.promo.discountValue);
      }
    } else {
      state.finalPrice = base;
    }
    state.totalPrice = state.finalPrice;
  }

  async function checkPrice() {
    if (!state.checkIn || !state.checkOut) return;
    trackEvent('CheckPrice', {});
    state.loading = true; state.error = null; render();
    try {
      var url = API_BASE + '/api/booking/availability?checkIn=' + state.checkIn + '&checkOut=' + state.checkOut;
      var res = await fetch(url);
      var data = await res.json();
      state.availability = data;
      if (data.unitTypes && data.unitTypes.length > 0) {
        var sel = state.selectedUnitTypeId ? data.unitTypes.find(function(u){return u.id===state.selectedUnitTypeId;}) : null;
        if (!sel) sel = data.unitTypes.find(function(u){return u.availableCount>0;});
        if (sel) {
          state.basePrice = sel.totalPrice;
          state.selectedUnitTypeId = sel.id;
          calcFinalPrice();
          state.widgetStep = 2;
          trackEvent('PriceViewed', { value: state.finalPrice });
        } else {
          state.error = t.noAvail;
        }
      } else {
        state.error = t.noAvail;
      }
    } catch(e) { state.error = t.errorOccurred; }
    state.loading = false; render();
  }

  // ─── Date selection ───
  function onDayClick(dateStr) {
    var d = parseDate(dateStr), today = new Date(); today.setHours(0,0,0,0);
    if (d < today) return;
    // Check if booked
    var ym = dateStr.substring(0,7);
    var dayData = state.calendarData[ym] && state.calendarData[ym][dateStr];
    if (dayData && dayData.status === 'booked') return;

    if (!state.checkIn || (state.checkIn && state.checkOut) || !state.selectingCheckOut) {
      state.checkIn = dateStr; state.checkOut = null; state.selectingCheckOut = true;
    } else {
      if (dateStr <= state.checkIn) {
        state.checkIn = dateStr; state.checkOut = null;
      } else {
        state.checkOut = dateStr; state.selectingCheckOut = false;
        state.calendarOpen = false;
        loadAvailability();
      }
    }
    render();
  }

  // ─── Render ───
  function render() {
    var nights = getNights();
    var totalGuests = state.adults + state.children;
    var h = '';

    h += '<div class="aw-card">';

    if (state.widgetStep === 1) {
      // ─── STEP 1: FORM ───
      h += '<div class="aw-step-title">' + (state.propertyName || '') + '</div>';

      // Dates
      h += '<div class="aw-dates" id="aw-dates-click">';
      h += '<div class="aw-date-box"><div class="aw-date-label">' + t.arrival + '</div>';
      h += '<div class="aw-date-value">' + (state.checkIn ? fmtDisplay(state.checkIn) : '—') + '</div></div>';
      h += '<div class="aw-cal-sep">→</div>';
      h += '<div class="aw-date-box"><div class="aw-date-label">' + t.departure + '</div>';
      h += '<div class="aw-date-value">' + (state.checkOut ? fmtDisplay(state.checkOut) : '—') + '</div></div>';
      if (nights > 0) h += '<div class="aw-nights-badge">' + nights + ' ' + nightsWord(nights) + '</div>';
      h += '</div>';

      // Guests
      h += '<div class="aw-guests" id="aw-guests-click">';
      h += '<div class="aw-guests-label">' + t.guests.toUpperCase() + '</div>';
      h += '<div class="aw-guests-value"><span>' + totalGuests + ' ' + guestsWord(totalGuests) + '</span><span class="aw-guests-chevron">' + (state.guestsOpen?'▲':'▼') + '</span></div>';
      if (state.guestsOpen) {
        h += '<div class="aw-guests-dropdown">';
        h += '<div class="aw-guest-row"><span class="aw-guest-row-label">' + t.adults + '</span>';
        h += '<div class="aw-guest-row-controls"><button class="aw-counter-btn" id="aw-adults-minus"' + (state.adults<=1?' disabled':'') + '>−</button>';
        h += '<span class="aw-counter-val">' + state.adults + '</span>';
        h += '<button class="aw-counter-btn" id="aw-adults-plus"' + (state.adults>=10?' disabled':'') + '>+</button></div></div>';
        h += '<div class="aw-guest-row"><span class="aw-guest-row-label">' + t.children + '</span>';
        h += '<div class="aw-guest-row-controls"><button class="aw-counter-btn" id="aw-children-minus"' + (state.children<=0?' disabled':'') + '>−</button>';
        h += '<span class="aw-counter-val">' + state.children + '</span>';
        h += '<button class="aw-counter-btn" id="aw-children-plus"' + (state.children>=6?' disabled':'') + '>+</button></div></div>';
        h += '</div>';
      }
      h += '</div>';

      // Promo code
      h += '<div class="aw-promo-row">';
      if (!state.promo.open && !state.promo.applied) {
        h += '<button class="aw-promo-toggle" id="aw-promo-open">+ ' + t.promoCode + '</button>';
      } else {
        h += '<div class="aw-promo-input-row">';
        h += '<input class="aw-promo-input" id="aw-promo-field" type="text" placeholder="' + t.promoCode + '"';
        h += ' value="' + (state.promo.code||'') + '"' + (state.promo.applied?' disabled':'') + '>';
        if (!state.promo.applied) {
          h += '<button class="aw-promo-apply-btn" id="aw-promo-apply">' + t.promoApply + '</button>';
        } else {
          h += '<span class="aw-promo-ok">' + t.promoApplied + '</span>';
          h += '<button class="aw-promo-remove" id="aw-promo-remove">' + t.promoRemove + '</button>';
        }
        h += '</div>';
        if (state.promo.error) h += '<div class="aw-promo-error">' + state.promo.error + '</div>';
      }
      h += '</div>';

      if (state.error) h += '<div class="aw-error">✗ ' + state.error + '</div>';

      // Check price button
      h += '<button class="aw-book-btn" id="aw-check-price-click"';
      h += (!state.checkIn||!state.checkOut||state.loading?' disabled':'');
      h += '>' + (state.loading ? ('⏳ ' + t.loading) : t.checkPrice) + '</button>';

    } else {
      // ─── STEP 2: PRICE BREAKDOWN ───
      var nights2 = getNights();
      var discAmt = 0;
      if (state.promo.applied && state.promo.discountType) {
        if (state.promo.discountType === 'percentage') discAmt = Math.round(state.basePrice * state.promo.discountValue / 100);
        else discAmt = Math.min(state.promo.discountValue, state.basePrice);
      }
      var avgPerNight = nights2 > 0 ? Math.round(state.finalPrice / nights2) : 0;

      h += '<div class="aw-price-header">';
      h += '<div class="aw-price-main">' + fmtPrice(state.finalPrice) + ' <span class="aw-price-currency">' + state.currency + '</span></div>';
      h += '<div class="aw-price-avg">' + fmtPrice(avgPerNight) + ' ' + state.currency + ' ' + t.perNightAvg + '</div>';
      h += '</div>';

      h += '<div class="aw-price-breakdown">';
      h += '<div class="aw-pb-row"><span>' + t.priceFor + ' ' + nights2 + ' ' + nightsWord(nights2) + '</span><span>' + fmtPrice(state.basePrice) + ' ' + state.currency + '</span></div>';
      if (discAmt > 0) {
        h += '<div class="aw-pb-row aw-pb-discount"><span>' + t.discount + ' (' + state.promo.code.toUpperCase() + ')</span><span>-' + fmtPrice(discAmt) + ' ' + state.currency + '</span></div>';
      }
      h += '<div class="aw-pb-row aw-pb-total"><span>' + t.total2 + '</span><span>' + fmtPrice(state.finalPrice) + ' ' + state.currency + '</span></div>';
      h += '</div>';

      // Dates summary
      h += '<div class="aw-dates-summary">';
      h += '<span>→ ' + fmtDisplay(state.checkIn) + ' – ' + fmtDisplay(state.checkOut) + '</span>';
      h += '<span class="aw-guests-summary">👤 ' + (state.adults+state.children) + '</span>';
      h += '</div>';

      // Buttons
      h += '<button class="aw-book-btn" id="aw-book-click">' + t.proceedToBook + ' →</button>';
      h += '<button class="aw-change-dates" id="aw-change-dates">← ' + t.changeDates + '</button>';
    }

    h += '</div>';

    // Availability Calendar (inline, unit-specific)
    if (SHOW_AVAIL_CAL) {
      h += renderAvailCalendar();
    }

    // Popup Calendar Overlay
    if (state.calendarOpen) {
      h += renderCalendar();
    }

    // Modal
    if (state.modalOpen) {
      h += renderModal();
    }

    root.innerHTML = h;
    bindEvents();
  }

  function renderCalendar() {
    var nights = getNights();
    var today = new Date(); today.setHours(0,0,0,0);
    var baseMonth = new Date(today.getFullYear(), today.getMonth() + state.calMonthOffset, 1);
    var m1 = { y: baseMonth.getFullYear(), m: baseMonth.getMonth() };
    var nm = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1);
    var m2 = { y: nm.getFullYear(), m: nm.getMonth() };

    // Ensure calendar data loaded
    var ym1 = m1.y + '-' + String(m1.m+1).padStart(2,'0');
    var ym2 = m2.y + '-' + String(m2.m+1).padStart(2,'0');
    if (!state.calendarData[ym1]) loadCalendar(ym1);
    if (!state.calendarData[ym2]) loadCalendar(ym2);

    var h = '<div class="aw-cal-overlay" id="aw-cal-overlay">';
    h += '<div class="aw-cal-popup">';

    // Header
    h += '<div class="aw-cal-header"><div>';
    h += '<div class="aw-cal-nights">' + (nights > 0 ? nights + ' ' + nightsWord(nights) : t.selectDates) + '</div>';
    if (state.checkIn && state.checkOut) {
      h += '<div class="aw-cal-range-text">' + fmtDisplay(state.checkIn) + ' – ' + fmtDisplay(state.checkOut) + '</div>';
    }
    h += '</div>';
    h += '<div class="aw-cal-dates-row">';
    h += '<div class="aw-cal-date-input"><div class="aw-cal-date-input-label">' + t.arrival + '</div><div class="aw-cal-date-input-value">' + (state.checkIn ? fmtDisplay(state.checkIn) : '—');
    if (state.checkIn) h += '<span class="aw-cal-date-clear" id="aw-clear-ci">✕</span>';
    h += '</div></div>';
    h += '<div class="aw-cal-date-input"><div class="aw-cal-date-input-label">' + t.departure + '</div><div class="aw-cal-date-input-value">' + (state.checkOut ? fmtDisplay(state.checkOut) : '—');
    if (state.checkOut) h += '<span class="aw-cal-date-clear" id="aw-clear-co">✕</span>';
    h += '</div></div>';
    h += '</div></div>';

    // Months
    h += '<div class="aw-cal-months">';
    [m1, m2].forEach(function(mo, idx) {
      h += '<div>';
      h += '<div class="aw-cal-month-title">';
      if (idx === 0) h += '<button class="aw-cal-nav-btn" id="aw-cal-prev"' + (state.calMonthOffset<=0?' disabled':'') + '>‹</button>';
      else h += '<span></span>';
      h += t.months[mo.m] + ' ' + mo.y;
      if (idx === 1) h += '<button class="aw-cal-nav-btn" id="aw-cal-next">›</button>';
      else h += '<span></span>';
      h += '</div>';
      // Weekdays
      h += '<div class="aw-cal-weekdays">';
      [t.mon,t.tue,t.wed,t.thu,t.fri,t.sat,t.sun].forEach(function(wd) { h += '<div>' + wd + '</div>'; });
      h += '</div>';
      // Days grid
      h += '<div class="aw-cal-grid">';
      var firstDay = getFirstDayMon(mo.y, mo.m);
      for (var i = 0; i < firstDay; i++) h += '<div class="aw-cal-day"></div>';
      var dim = getDaysInMonth(mo.y, mo.m);
      var todayStr = fmtDate(today);
      for (var d = 1; d <= dim; d++) {
        var ds = mo.y + '-' + String(mo.m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var dObj = parseDate(ds);
        var isPast = dObj < today;
        var dow = dObj.getDay();
        var isWE = dow === 0 || dow === 6;
        var ym = ds.substring(0,7);
        var dd = state.calendarData[ym] && state.calendarData[ym][ds];
        var isBooked = dd && dd.status === 'booked';
        var cls = 'aw-cal-day';
        if (isPast) cls += ' aw-past';
        if (isBooked && !isPast) cls += ' aw-booked';
        if (isWE && !isPast && !isBooked) cls += ' aw-weekend';
        if (ds === todayStr) cls += ' aw-today';
        if (ds === state.checkIn || ds === state.checkOut) cls += ' aw-selected';
        if (state.checkIn && state.checkOut && ds > state.checkIn && ds < state.checkOut) cls += ' aw-in-range';
        if (ds === state.checkIn && state.checkOut) cls += ' aw-range-start';
        if (ds === state.checkOut && state.checkIn) cls += ' aw-range-end';
        h += '<button class="' + cls + '" data-date="' + ds + '"' + (isPast || isBooked ? ' disabled' : '') + '>' + d + '</button>';
      }
      h += '</div></div>';
    });
    h += '</div>';

    // Footer
    h += '<div class="aw-cal-footer">';
    h += '<button class="aw-cal-clear-btn" id="aw-cal-clear">' + t.clearDates + '</button>';
    h += '<button class="aw-cal-close-btn" id="aw-cal-close">' + t.close + '</button>';
    h += '</div></div></div>';
    return h;
  }

  // ─── Inline Availability Calendar ───
  function renderAvailCalendar() {
    var today = new Date(); today.setHours(0,0,0,0);
    var base = new Date(today.getFullYear(), today.getMonth() + state.availCalOffset, 1);
    var months = [];
    for (var i = 0; i < 2; i++) {
      var mo = new Date(base.getFullYear(), base.getMonth() + i, 1);
      months.push({ y: mo.getFullYear(), m: mo.getMonth() });
    }
    var todayStr = today.toISOString().split('T')[0];
    var h = '<div class="aw-avail-cal">';
    h += '<div class="aw-avail-cal-title">';
    h += '<button class="aw-cal-nav-btn" id="aw-avail-prev"' + (state.availCalOffset <= 0 ? ' disabled' : '') + '>&#8249;</button>';
    h += '<span>' + tx.availCal + '</span>';
    h += '<button class="aw-cal-nav-btn" id="aw-avail-next">&#8250;</button>';
    h += '</div>';
    h += '<div class="aw-avail-legend">';
    h += '<span class="aw-legend-item"><span class="aw-legend-dot aw-legend-free"></span>' + tx.available + '</span>';
    h += '<span class="aw-legend-item"><span class="aw-legend-dot aw-legend-booked"></span>' + tx.booked + '</span>';
    h += '</div>';
    h += '<div class="aw-avail-months">';
    months.forEach(function(mo) {
      h += '<div class="aw-avail-month">';
      h += '<div class="aw-avail-month-name">' + t.months[mo.m] + ' ' + mo.y + '</div>';
      h += '<div class="aw-cal-weekdays">';
      [t.mon,t.tue,t.wed,t.thu,t.fri,t.sat,t.sun].forEach(function(wd) { h += '<div>' + wd + '</div>'; });
      h += '</div>';
      h += '<div class="aw-cal-grid">';
      var firstDay = getFirstDayMon(mo.y, mo.m);
      for (var i = 0; i < firstDay; i++) h += '<div class="aw-cal-day"></div>';
      var dim = getDaysInMonth(mo.y, mo.m);
      for (var d = 1; d <= dim; d++) {
        var ds = mo.y + '-' + String(mo.m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var dObj = new Date(ds + 'T00:00:00');
        var isPast = dObj < today;
        var isBooked = state.bookedDates.has(ds);
        var isToday = ds === todayStr;
        var isCheckIn = ds === state.checkIn;
        var isCheckOut = ds === state.checkOut;
        var inRange = state.checkIn && state.checkOut && ds > state.checkIn && ds < state.checkOut;
        var cls = 'aw-cal-day';
        if (isPast) cls += ' aw-past';
        else if (isBooked) cls += ' aw-booked';
        if (isToday && !isPast) cls += ' aw-today';
        if (isCheckIn || isCheckOut) cls += ' aw-selected';
        if (inRange) cls += ' aw-in-range';
        var attrs = (isPast || isBooked) ? ' disabled' : ' data-date="' + ds + '"';
        h += '<button class="' + cls + '"' + attrs + '>' + d + '</button>';
      }
      h += '</div></div>';
    });
    h += '</div></div>';
    return h;
  }

  function renderModal() {
    var nights = getNights();
    var h = '<div class="aw-modal-overlay" id="aw-modal-overlay">';
    h += '<div class="aw-modal">';

    // Header
    var titles = [t.bookingSummary, t.guestInfo, t.success];
    h += '<div class="aw-modal-header"><div class="aw-modal-title">' + titles[state.modalStep - 1] + '</div>';
    h += '<button class="aw-modal-close" id="aw-modal-close">✕</button></div>';

    h += '<div class="aw-modal-body">';

    if (state.loading) {
      h += '<div class="aw-loading"><div class="aw-spinner"></div></div>';
    } else if (state.modalStep === 1) {
      // Summary + House selection
      h += '<div class="aw-summary-row"><span>' + t.arrival + '</span><span>' + fmtDisplay(state.checkIn) + '</span></div>';
      h += '<div class="aw-summary-row"><span>' + t.departure + '</span><span>' + fmtDisplay(state.checkOut) + '</span></div>';
      h += '<div class="aw-summary-row"><span>' + t.nights + '</span><span>' + nights + '</span></div>';
      h += '<div class="aw-summary-row"><span>' + t.guests + '</span><span>' + (state.adults + state.children) + '</span></div>';

      // House selection
      if (state.availability && state.availability.unitTypes && state.availability.unitTypes.length > 0) {
        var avail = state.availability.unitTypes.filter(function(u){return u.availableCount > 0;});
        if (avail.length > 0) {
          h += '<hr class="aw-summary-divider">';
          h += '<div style="font-size:14px;font-weight:600;margin-bottom:8px">' + t.selectHouse + '</div>';
          h += '<div class="aw-house-list">';
          avail.forEach(function(ut) {
            var sel = state.selectedUnitTypeId === ut.id;
            h += '<div class="aw-house-item' + (sel ? ' aw-selected' : '') + '" data-house="' + ut.id + '">';
            h += '<div class="aw-house-name">' + ut.name + '</div>';
            h += '<div class="aw-house-meta">👥 ' + ut.maxOccupancy + ' · 🛏️ ' + ut.bedsDouble + '</div>';
            h += '<div class="aw-house-price">' + fmtPrice(ut.totalPrice) + ' ' + ut.currency + ' (' + fmtPrice(ut.avgPricePerNight) + t.perNight + ')</div>';
            h += '<div class="aw-house-avail' + (ut.availableCount <= 2 ? ' aw-low' : '') + '">' + ut.availableCount + ' ' + t.available + '</div>';
            h += '</div>';
          });
          h += '</div>';
        } else {
          h += '<div style="padding:16px;text-align:center;color:#717171">' + t.noAvail + '</div>';
        }
      }

      // Total
      h += '<div class="aw-summary-row aw-total"><span>' + t.totalLabel + '</span><span>' + fmtPrice(state.totalPrice) + ' ' + state.currency + '</span></div>';

    } else if (state.modalStep === 2) {
      // Guest info form
      if (state.error) h += '<div class="aw-error">✗ ' + state.error + '</div>';
      h += '<div class="aw-field"><label>' + t.firstName + ' <span class="aw-req">*</span></label>';
      h += '<input type="text" id="aw-fname" value="' + escHtml(state.firstName) + '" placeholder="' + t.firstName + '"></div>';
      h += '<div class="aw-field"><label>' + t.lastName + ' <span class="aw-req">*</span></label>';
      h += '<input type="text" id="aw-lname" value="' + escHtml(state.lastName) + '" placeholder="' + t.lastName + '"></div>';
      h += '<div class="aw-field"><label>' + t.phone + ' <span class="aw-req">*</span></label>';
      h += '<input type="tel" id="aw-phone" value="' + escHtml(state.phone) + '" placeholder="+380..."></div>';
      h += '<div class="aw-field"><label>' + t.email + '</label>';
      h += '<input type="email" id="aw-email" value="' + escHtml(state.email) + '" placeholder="email@example.com"></div>';

      // Summary
      h += '<hr class="aw-summary-divider">';
      h += '<div class="aw-summary-row"><span>' + t.arrival + '</span><span>' + fmtDisplay(state.checkIn) + '</span></div>';
      h += '<div class="aw-summary-row"><span>' + t.departure + '</span><span>' + fmtDisplay(state.checkOut) + '</span></div>';
      h += '<div class="aw-summary-row aw-total"><span>' + t.totalLabel + '</span><span>' + fmtPrice(state.totalPrice) + ' ' + state.currency + '</span></div>';

    } else if (state.modalStep === 3) {
      // Success
      h += '<div class="aw-success">';
      h += '<div class="aw-success-icon">✅</div>';
      h += '<div class="aw-success-title">' + t.success + '</div>';
      h += '<div class="aw-success-text">' + t.successMsg + '</div>';
      if (state.reservation) {
        h += '<div class="aw-success-id">' + t.bookingId + ': ' + state.reservation.reservationId + '</div>';
      }
      h += '</div>';
    }

    h += '</div>';

    // Footer
    if (!state.loading && state.modalStep < 3) {
      h += '<div class="aw-modal-footer" style="display:flex;justify-content:space-between">';
      if (state.modalStep === 2) {
        h += '<button class="aw-cal-clear-btn" id="aw-modal-back">' + t.back + '</button>';
        h += '<button class="aw-book-btn" id="aw-modal-submit" style="width:auto;padding:12px 24px">' + t.confirmBook + '</button>';
      } else {
        h += '<span></span>';
        var canNext = state.selectedUnitTypeId && state.availability;
        h += '<button class="aw-book-btn" id="aw-modal-next" style="width:auto;padding:12px 24px"' + (!canNext?' disabled':'') + '>' + t.next + ' →</button>';
      }
      h += '</div>';
    }

    h += '</div></div>';
    return h;
  }

  function escHtml(s) { return (s||'').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  // ─── Event Binding ───
  function bindEvents() {
    // Dates click -> open calendar
    var datesEl = root.querySelector('#aw-dates-click');
    if (datesEl) datesEl.addEventListener('click', function() { state.calendarOpen = true; render(); });

    // Guests toggle
    var guestsEl = root.querySelector('#aw-guests-click');
    if (guestsEl) guestsEl.addEventListener('click', function(e) { if (!e.target.closest('.aw-counter-btn')) { state.guestsOpen = !state.guestsOpen; render(); } });

    // Guest counters
    bindClick('aw-adults-minus', function(){ state.adults = Math.max(1, state.adults-1); render(); });
    bindClick('aw-adults-plus', function(){ state.adults = Math.min(10, state.adults+1); render(); });
    bindClick('aw-children-minus', function(){ state.children = Math.max(0, state.children-1); render(); });
    bindClick('aw-children-plus', function(){ state.children = Math.min(6, state.children+1); render(); });

    // Book button (step 2 → modal)
    bindClick('aw-book-click', function() {
      if (!state.checkIn || !state.checkOut) return;
      trackEvent('InitiateCheckout', { value: state.finalPrice });
      state.modalOpen = true; state.modalStep = 1; state.error = null;
      if (!state.availability) loadAvailability();
      render();
    });

    // Check price button (step 1 → step 2)
    bindClick('aw-check-price-click', function() { checkPrice(); });

    // Change dates (step 2 → step 1)
    bindClick('aw-change-dates', function() {
      state.widgetStep = 1;
      state.availability = null;
      render();
    });

    // Promo code
    bindClick('aw-promo-open', function() { state.promo.open = true; render(); });
    bindClick('aw-promo-apply', function() {
      var field = root.querySelector('#aw-promo-field');
      if (field) state.promo.code = field.value;
      applyPromo();
    });
    bindClick('aw-promo-remove', function() {
      state.promo = { code: '', open: false, applied: false, discountType: null, discountValue: null, error: null };
      calcFinalPrice();
      render();
    });
    // Sync promo input
    var promoField = root.querySelector('#aw-promo-field');
    if (promoField) promoField.addEventListener('keydown', function(e) {
      state.promo.code = promoField.value;
      if (e.key === 'Enter') applyPromo();
    });

    // Calendar events
    bindClick('aw-cal-overlay', function(e) { if (e.target.id === 'aw-cal-overlay') { state.calendarOpen = false; render(); } });
    bindClick('aw-cal-close', function() { state.calendarOpen = false; render(); });
    bindClick('aw-cal-clear', function() { state.checkIn = null; state.checkOut = null; state.selectingCheckOut = false; render(); });
    bindClick('aw-cal-prev', function() { state.calMonthOffset = Math.max(0, state.calMonthOffset - 1); render(); });
    bindClick('aw-cal-next', function() { state.calMonthOffset++; render(); });
    bindClick('aw-clear-ci', function() { state.checkIn = null; state.checkOut = null; state.selectingCheckOut = false; render(); });
    bindClick('aw-clear-co', function() { state.checkOut = null; state.selectingCheckOut = true; render(); });

    // Calendar day clicks
    root.querySelectorAll('.aw-cal-day[data-date]').forEach(function(btn) {
      btn.addEventListener('click', function() { onDayClick(btn.getAttribute('data-date')); });
    });

    // Modal events
    bindClick('aw-modal-overlay', function(e) { if (e.target.id === 'aw-modal-overlay') { state.modalOpen = false; render(); } });
    bindClick('aw-modal-close', function() { state.modalOpen = false; state.modalStep = 1; render(); });

    // House selection
    root.querySelectorAll('.aw-house-item[data-house]').forEach(function(el) {
      el.addEventListener('click', function() {
        var hid = el.getAttribute('data-house');
        state.selectedUnitTypeId = hid;
        var ut = state.availability.unitTypes.find(function(u){return u.id===hid;});
        if (ut) state.totalPrice = ut.totalPrice;
        render();
      });
    });

    // Modal navigation
    bindClick('aw-modal-next', function() { state.modalStep = 2; state.error = null; render(); });
    bindClick('aw-modal-back', function() { state.modalStep = 1; state.error = null; render(); });
    bindClick('aw-modal-submit', function() {
      // Read form values
      var fn = root.querySelector('#aw-fname'); if(fn) state.firstName = fn.value;
      var ln = root.querySelector('#aw-lname'); if(ln) state.lastName = ln.value;
      var ph = root.querySelector('#aw-phone'); if(ph) state.phone = ph.value;
      var em = root.querySelector('#aw-email'); if(em) state.email = em.value;
      if (!state.firstName.trim() || !state.lastName.trim() || !state.phone.trim()) {
        state.error = t.firstName + ', ' + t.lastName + ', ' + t.phone + ' — ' + t.required;
        render(); return;
      }
      submitReservation();
    });

    // Sync form inputs on change (for re-render preservation)
    ['aw-fname','aw-lname','aw-phone','aw-email'].forEach(function(id) {
      var el = root.querySelector('#' + id);
      if (el) el.addEventListener('input', function() {
        if (id==='aw-fname') state.firstName = el.value;
        if (id==='aw-lname') state.lastName = el.value;
        if (id==='aw-phone') state.phone = el.value;
        if (id==='aw-email') state.email = el.value;
      });
    });

    // Availability calendar navigation
    bindClick('aw-avail-prev', function() { state.availCalOffset = Math.max(0, state.availCalOffset - 1); render(); });
    bindClick('aw-avail-next', function() { state.availCalOffset++; render(); });
    // Availability calendar day clicks (same as main calendar)
    root.querySelectorAll('.aw-avail-cal .aw-cal-day[data-date]').forEach(function(btn) {
      btn.addEventListener('click', function() { onDayClick(btn.getAttribute('data-date')); });
    });
  }

  function bindClick(id, fn) {
    var el = root.querySelector('#' + id);
    if (el) el.addEventListener('click', fn);
  }

  // ─── Init ───
  if (UNIT_ID || UNIT_TYPE_ID) {
    loadUnitAvailability().then(function() { loadConfig(); });
  } else {
    loadConfig();
  }
})();
