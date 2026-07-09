/**
 * ALiSiO PMS — Service Booking Widget (Sauna / Tub / Breakfast)
 * Usage:
 *   <div id="alisio-service-widget"></div>
 *   <script src="https://your-pms.com/widget/service-embed.js"
 *     data-service="sauna"
 *     data-lang="uk"
 *     data-color="#e61e4d"
 *   ></script>
 *
 * Supported data-service: sauna, tub, breakfast
 */
(function() {
  'use strict';

  // ─── Config from script tag ───
  var scriptTag = document.currentScript || (function() {
    // Dynamic injection: find the most recently added script with data-service
    var scripts = document.querySelectorAll('script[data-service]');
    return scripts.length > 0 ? scripts[scripts.length - 1] : null;
  })();
  var API_BASE = scriptTag ? (scriptTag.getAttribute('data-api') || scriptTag.src.replace(/\/widget\/service-embed\.js.*$/, '')) : '';
  var SERVICE_TYPE = scriptTag ? (scriptTag.getAttribute('data-service') || 'sauna') : 'sauna';
  var LANG = scriptTag ? (scriptTag.getAttribute('data-lang') || 'en') : 'en';
  var ACCENT = scriptTag ? (scriptTag.getAttribute('data-color') || '#1a1a2e') : '#1a1a2e';
  var RESERVATION_ID = scriptTag ? (scriptTag.getAttribute('data-reservation') || '') : '';
  var ENABLE_PAYMENT = scriptTag ? (scriptTag.getAttribute('data-payment') !== 'false') : true;
  var AUTO_PROMO = scriptTag ? (scriptTag.getAttribute('data-promo') || '') : '';
  var SITE_ID = scriptTag ? (scriptTag.getAttribute('data-site') || '') : '';
  // Stay window — used by breakfast widget to render multi-day picker
  // (each morning between check-in+1 and check-out is a candidate)
  var STAY_CHECKIN  = scriptTag ? (scriptTag.getAttribute('data-checkin')  || '') : '';
  var STAY_CHECKOUT = scriptTag ? (scriptTag.getAttribute('data-checkout') || '') : '';

  // Service ID mapping
  var SERVICE_IDS = { sauna: 'svc_sauna', tub: 'svc_pool', breakfast: 'svc_breakfast' };
  var serviceId = SERVICE_IDS[SERVICE_TYPE] || 'svc_sauna';

  // ─── i18n ───
  var T = {
    en: {
      sauna: 'Sauna', tub: 'Hot Tub', breakfast: 'Breakfast',
      saunaDesc: 'Finnish sauna with firewood. Minimum booking — 2 hours.',
      tubDesc: 'Outdoor hot tub with forest views. Minimum — 2 hours.',
      breakfastDesc: 'Fresh morning breakfast delivered to your cabin.',
      selectDate: 'Select date', selectTime: 'Start time', duration: 'Duration',
      hours: 'hours', hour: 'hour', perHour: '/hour',
      broom: 'Sauna broom', broomDesc: 'Traditional birch broom',
      addToBooking: 'Book Now', cancel: 'Cancel', close: 'Close',
      total: 'Total', booked: 'Booked', available: 'Available',
      quantity: 'Quantity', addItem: 'Add', order: 'Order Breakfast',
      success: 'Booking confirmed!', successMsg: 'Your service has been booked successfully.',
      errorOccurred: 'An error occurred', loading: 'Loading...',
      minHours: 'min. 2 hours', persons: 'Persons', name: 'Your name', phone: 'Phone',
      noSlots: 'No available slots', slotBooked: 'This slot is taken',
      payNow: 'Pay Now', payAmount: 'Pay', processing: 'Processing payment...',
      paymentTitle: 'Payment', paymentDesc: 'Enter your card details to complete the booking.',
      backToDetails: '← Back', paymentFailed: 'Payment failed. Please try again.',
      paymentSuccess: 'Payment successful!',
      promoLabel: 'Have a promo code?', promoApply: 'Apply', promoApplied: 'Applied', promoInvalid: 'Invalid code', promoPlaceholder: 'Enter code',
      breakfastDays: 'Breakfast days', breakfastDaysHint: 'Tap each morning you want delivery', perDay: '/day', noDaysSelected: 'Select at least one day',
      addToCart: 'Add to cart',
      mon:'Mo',tue:'Tu',wed:'We',thu:'Th',fri:'Fr',sat:'Sa',sun:'Su',
      months:['January','February','March','April','May','June','July','August','September','October','November','December'],
    },
    uk: {
      sauna: 'Сауна', tub: 'Купіль', breakfast: 'Сніданок',
      saunaDesc: 'Фінська сауна з дровами. Мінімальне бронювання — 2 години.',
      tubDesc: 'Купіль просто неба з видом на ліс. Мінімум — 2 години.',
      breakfastDesc: 'Свіжий ранковий сніданок з доставкою до будиночка.',
      selectDate: 'Оберіть дату', selectTime: 'Час початку', duration: 'Тривалість',
      hours: 'годин', hour: 'година', perHour: '/год',
      broom: 'Вінік для сауни', broomDesc: 'Традиційний березовий вінік',
      addToBooking: 'Забронювати', cancel: 'Скасувати', close: 'Закрити',
      total: 'Разом', booked: 'Зайнято', available: 'Вільно',
      quantity: 'Кількість', addItem: 'Додати', order: 'Замовити сніданок',
      success: 'Бронювання підтверджено!', successMsg: 'Вашу послугу успішно заброньовано.',
      errorOccurred: 'Виникла помилка', loading: 'Завантаження...',
      minHours: 'мін. 2 години', persons: 'Кількість осіб', name: 'Ваше ім\'я', phone: 'Телефон',
      noSlots: 'Немає вільних слотів', slotBooked: 'Цей слот зайнятий',
      payNow: 'Оплатити', payAmount: 'Оплатити', processing: 'Обробка платежу...',
      paymentTitle: 'Оплата', paymentDesc: 'Введіть дані картки для завершення бронювання.',
      backToDetails: '← Назад', paymentFailed: 'Оплата не вдалася. Спробуйте ще раз.',
      paymentSuccess: 'Оплата пройшла успішно!',
      promoLabel: 'Є промокод?', promoApply: 'Застосувати', promoApplied: 'Застосовано', promoInvalid: 'Невірний код', promoPlaceholder: 'Введіть код',
      breakfastDays: 'Дні сніданку', breakfastDaysHint: 'Позначте ранки, в які хочете доставку', perDay: '/день', noDaysSelected: 'Оберіть хоча б один день',
      addToCart: 'Додати в кошик',
      mon:'Пн',tue:'Вт',wed:'Ср',thu:'Чт',fri:'Пт',sat:'Сб',sun:'Нд',
      months:['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
    },
    cs: {
      sauna: 'Sauna', tub: 'Kádě', breakfast: 'Snídaně',
      saunaDesc: 'Finská sauna na dřevo. Minimální rezervace — 2 hodiny.',
      tubDesc: 'Venkovní kádě s výhledem do lesa. Minimálně 2 hodiny.',
      breakfastDesc: 'Čerstvá ranní snídaně doručená k chatce.',
      selectDate: 'Vyberte datum', selectTime: 'Čas začátku', duration: 'Doba trvání',
      hours: 'hodin', hour: 'hodina', perHour: '/hod',
      broom: 'Saunový metlík', broomDesc: 'Tradiční březový metlík',
      addToBooking: 'Rezervovat', cancel: 'Zrušit', close: 'Zavřít',
      total: 'Celkem', booked: 'Obsazeno', available: 'Volno',
      quantity: 'Množství', addItem: 'Přidat', order: 'Objednat snídaně',
      success: 'Rezervace potvrzena!', successMsg: 'Vaše služba byla úspěšně zarezervována.',
      errorOccurred: 'Došlo k chybě', loading: 'Načítání...',
      minHours: 'min. 2 hodiny', persons: 'Osoby', name: 'Vaše jméno', phone: 'Telefon',
      noSlots: 'Žádné volné sloty', slotBooked: 'Tento slot je obsazen',
      payNow: 'Zaplatit', payAmount: 'Zaplatit', processing: 'Zpracování platby...',
      paymentTitle: 'Platba', paymentDesc: 'Zadejte údaje karty pro dokončení rezervace.',
      backToDetails: '← Zpět', paymentFailed: 'Platba se nezdařila. Zkuste to znovu.',
      paymentSuccess: 'Platba proběhla úspěšně!',
      promoLabel: 'Máte promokód?', promoApply: 'Použít', promoApplied: 'Aplikováno', promoInvalid: 'Neplatný kód', promoPlaceholder: 'Zadejte kód',
      breakfastDays: 'Dny snídaně', breakfastDaysHint: 'Označte rána, kdy chcete doručit', perDay: '/den', noDaysSelected: 'Vyberte alespoň jeden den',
      addToCart: 'Přidat do košíku',
      mon:'Po',tue:'Út',wed:'St',thu:'Čt',fri:'Pá',sat:'So',sun:'Ne',
      months:['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'],
    },
    de: {
      sauna: 'Sauna', tub: 'Badezuber', breakfast: 'Frühstück',
      saunaDesc: 'Finnische Holzsauna. Mindestbuchung — 2 Stunden.',
      tubDesc: 'Badezuber im Freien mit Waldblick. Mindestens 2 Stunden.',
      breakfastDesc: 'Frisches Frühstück direkt zur Hütte geliefert.',
      selectDate: 'Datum wählen', selectTime: 'Startzeit', duration: 'Dauer',
      hours: 'Stunden', hour: 'Stunde', perHour: '/Std',
      broom: 'Saunabesen', broomDesc: 'Traditioneller Birkenbesen',
      addToBooking: 'Jetzt buchen', cancel: 'Abbrechen', close: 'Schließen',
      total: 'Gesamt', booked: 'Belegt', available: 'Verfügbar',
      quantity: 'Menge', addItem: 'Hinzufügen', order: 'Frühstück bestellen',
      success: 'Buchung bestätigt!', successMsg: 'Ihr Service wurde erfolgreich gebucht.',
      errorOccurred: 'Ein Fehler ist aufgetreten', loading: 'Laden...',
      minHours: 'min. 2 Stunden', persons: 'Personen', name: 'Ihr Name', phone: 'Telefon',
      noSlots: 'Keine freien Slots', slotBooked: 'Dieser Slot ist belegt',
      payNow: 'Jetzt bezahlen', payAmount: 'Bezahlen', processing: 'Zahlung wird verarbeitet...',
      paymentTitle: 'Bezahlung', paymentDesc: 'Geben Sie Ihre Kartendaten ein, um die Buchung abzuschließen.',
      backToDetails: '← Zurück', paymentFailed: 'Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.',
      paymentSuccess: 'Zahlung erfolgreich!',
      promoLabel: 'Haben Sie einen Aktionscode?', promoApply: 'Anwenden', promoApplied: 'Angewendet', promoInvalid: 'Ungültiger Code', promoPlaceholder: 'Code eingeben',
      breakfastDays: 'Frühstückstage', breakfastDaysHint: 'Wählen Sie die Morgen für die Lieferung', perDay: '/Tag', noDaysSelected: 'Mindestens einen Tag wählen',
      addToCart: 'In den Warenkorb',
      mon:'Mo',tue:'Di',wed:'Mi',thu:'Do',fri:'Fr',sat:'Sa',sun:'So',
      months:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
    }
  };
  var t = T[LANG] || T.en;

  // ─── State ───
  var state = {
    view: 'card', // card | form | payment | success
    loading: false, error: null,
    // Slot services (sauna, tub)
    date: null, startHour: 14, hours: 2, brooms: 0,
    price: 600, originalPrice: 600, broomPrice: 300, addons: [],
    bookedSlots: [],
    // Breakfast
    menuItems: [], itemQty: {}, selectedBreakfastDates: [],
    // Guest (for standalone, no reservation)
    guestName: '', guestPhone: '',
    // Calendar
    calOpen: false, calMonthOffset: 0,
    // Payment
    paymentSessionToken: null, paymentSessionId: null,
    paymentSdkUrl: null, paymentSessionUrl: null,
    teyaCheckout: null, paymentTotal: 0,
    // Promo
    promoCode: AUTO_PROMO, promoApplied: false, promoOpen: !!AUTO_PROMO,
    promoDiscountType: null, promoDiscountValue: null, promoError: null,
  };

  // ─── DOM ───
  var CONTAINER_ID = (scriptTag && scriptTag.getAttribute('data-container')) || window.__ALISIO_SERVICE_CONTAINER || 'alisio-service-widget';
  // Reset global override after use
  if (window.__ALISIO_SERVICE_CONTAINER) { delete window.__ALISIO_SERVICE_CONTAINER; }
  var container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  var shadow = container.attachShadow({ mode: 'open' });

  // Inject CSS
  var style = document.createElement('style');
  style.textContent = buildCSS();
  shadow.appendChild(style);

  var root = document.createElement('div');
  root.className = 'asw-root';
  shadow.appendChild(root);

  // ─── Helpers ───
  function fmtPrice(n) { return new Intl.NumberFormat('cs-CZ').format(n); }
  function fmtDate(d) { return d.toISOString().split('T')[0]; }
  function parseDate(s) { return new Date(s + 'T00:00:00'); }
  function fmtDisplay(s) {
    var d = parseDate(s);
    return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
  }
  function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
  function getFirstDayMon(y, m) { var d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

  function isSlotBooked(hour) {
    var slotStart = String(hour).padStart(2, '0') + ':00';
    return state.bookedSlots.some(function(s) { return s.start_time === slotStart && s.date === state.date; });
  }

  function getSlotTotal() {
    return state.price * state.hours + state.broomPrice * state.brooms;
  }

  // Per-day breakfast subtotal (sum of items × qty)
  function getBreakfastDailyTotal() {
    var tot = 0;
    state.menuItems.forEach(function(item) {
      tot += (item.price || 0) * (state.itemQty[item.id] || 0);
    });
    return tot;
  }

  // Total = per-day × number of selected breakfast days. Falls back to
  // single-day pricing when stay window is unknown (standalone widget).
  function getBreakfastTotal() {
    var days = getBreakfastDayCount();
    return getBreakfastDailyTotal() * Math.max(1, days);
  }

  // List of «morning» dates between check-in+1 and check-out (inclusive),
  // i.e. each morning the guest is present at breakfast time. Empty when
  // stay window is not provided.
  function getBreakfastDays() {
    if (!STAY_CHECKIN || !STAY_CHECKOUT) return [];
    var ci = parseDate(STAY_CHECKIN);
    var co = parseDate(STAY_CHECKOUT);
    var days = [];
    var d = new Date(ci); d.setDate(d.getDate() + 1);
    while (d <= co) {
      days.push(fmtDate(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  // How many days count toward the total. When stay window is missing
  // we treat it as a 1-day order so the existing standalone flow keeps
  // working unchanged.
  function getBreakfastDayCount() {
    if (!STAY_CHECKIN || !STAY_CHECKOUT) return 1;
    return state.selectedBreakfastDates.length;
  }

  // ─── API ───
  async function loadServiceData() {
    state.loading = true; render();
    try {
      var today = new Date(); today.setHours(0,0,0,0);
      var checkIn = fmtDate(today);
      var futureDate = new Date(today); futureDate.setDate(futureDate.getDate() + 30);
      var checkOut = fmtDate(futureDate);

      var url = API_BASE + '/api/booking/services?serviceId=' + serviceId + '&checkIn=' + checkIn + '&checkOut=' + checkOut;
      var res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load');
      var data = await res.json();

      state.price = data.price || 600;
      state.originalPrice = state.price;
      state.bookedSlots = data.bookedSlots || [];
      state.addons = data.addons || [];
      if (state.addons.length > 0) state.broomPrice = state.addons[0].price || 300;

      // For breakfast
      if (data.menuItems) {
        state.menuItems = data.menuItems;
        state.menuItems.forEach(function(item) {
          if (!state.itemQty[item.id]) state.itemQty[item.id] = 0;
        });
        // Default-select all breakfast days when guest has a stay window.
        // Most guests want delivery every morning — they can opt-out per day.
        if (STAY_CHECKIN && STAY_CHECKOUT && state.selectedBreakfastDates.length === 0) {
          state.selectedBreakfastDates = getBreakfastDays();
        }
      }

      if (!state.date) state.date = checkIn;
    } catch(e) { state.error = t.errorOccurred; console.error('ASW:', e); }
    state.loading = false;

    // Auto-apply promo code if provided via data-promo
    if (AUTO_PROMO && !state.promoApplied) {
      await applyPromoCode(AUTO_PROMO);
    }
    render();
  }

  // ─── Promo Code ───
  async function applyPromoCode(code) {
    if (!code) return;
    state.promoError = null;
    try {
      var res = await fetch(API_BASE + '/api/booking/promo?code=' + encodeURIComponent(code) + '&serviceId=' + serviceId);
      var data = await res.json();
      if (data.valid) {
        state.promoApplied = true;
        state.promoCode = data.code;
        state.promoDiscountType = data.discount_type;
        state.promoDiscountValue = data.discount_value;
        // Apply discount to displayed price
        if (data.discount_type === 'fixed_price') {
          state.price = data.discount_value;
        } else if (data.discount_type === 'percentage') {
          state.price = Math.round(state.originalPrice * (1 - data.discount_value / 100));
        }
      } else {
        state.promoError = data.error || t.promoInvalid;
        state.promoApplied = false;
      }
    } catch(e) {
      state.promoError = t.promoInvalid;
      console.error('ASW promo error:', e);
    }
    render();
  }

  // ─── Payment Flow (Hosted Checkout) ───
  async function initiatePayment(amount, description) {
    if (!ENABLE_PAYMENT) {
      return null;
    }
    state.loading = true; state.error = null; state.paymentTotal = amount; render();
    try {
      // Save booking data to sessionStorage so we can finalize after redirect back
      var bookingData = {
        serviceType: SERVICE_TYPE,
        serviceId: serviceId,
        date: state.date,
        startHour: state.startHour,
        hours: state.hours,
        brooms: state.brooms,
        itemQty: state.itemQty,
        selectedBreakfastDates: state.selectedBreakfastDates,
        reservationId: RESERVATION_ID,
        promoCode: state.promoApplied ? state.promoCode : null,
      };
      try { sessionStorage.setItem('asw_pending_booking', JSON.stringify(bookingData)); } catch(e) {}

      var res = await fetch(API_BASE + '/api/booking/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SERVICE_TYPE === 'breakfast' ? {
          // Breakfast-specific payload: no hours/slots
          amount: amount,
          currency: 'CZK',
          description: description,
          reservation_id: RESERVATION_ID || undefined,
          return_path: window.location.pathname,
          service_id: serviceId,
          service_date: (state.selectedBreakfastDates && state.selectedBreakfastDates.length > 0)
            ? state.selectedBreakfastDates[0]
            : (STAY_CHECKIN || new Date().toISOString().split('T')[0]),
          breakfast_dates: state.selectedBreakfastDates.length > 0
            ? state.selectedBreakfastDates : undefined,
          menu_items: Object.keys(state.itemQty).filter(function(id) { return state.itemQty[id] > 0; }).map(function(id) {
            var item = state.menuItems.find(function(m) { return m.id === id; });
            return { menuItemId: id, name: (item && (item.nameEn || item.name)) || id, quantity: state.itemQty[id] };
          }),
          promoCode: (state.promoApplied && state.promoCode) ? state.promoCode : undefined,
          site_slug: SITE_ID || undefined,
        } : {
          // Slot service (sauna/tub) payload
          amount: amount,
          currency: 'CZK',
          description: description,
          reservation_id: RESERVATION_ID || undefined,
          return_path: window.location.pathname,
          service_id: serviceId,
          service_date: state.date,
          start_hour: state.startHour,
          hours: state.hours,
          addons: (SERVICE_TYPE === 'sauna' && state.brooms > 0) ? [{ id: 'addon_broom', quantity: state.brooms, price: state.broomPrice }] : undefined,
          promoCode: (state.promoApplied && state.promoCode) ? state.promoCode : undefined,
          site_slug: SITE_ID || undefined,
        })
      });
      if (!res.ok) { var err = await res.json(); throw new Error(err.error || 'Payment init failed'); }
      var data = await res.json();
      
      state.paymentSessionId = data.session_id;
      state.paymentSessionUrl = data.session_url;

      // Redirect to Teya Hosted Checkout
      if (data.session_url) {
        try {
          if (window.top && window.top !== window) {
            window.top.location.href = data.session_url;
          } else {
            window.location.href = data.session_url;
          }
        } catch (e) {
          try {
            window.open(data.session_url, '_top');
          } catch (err) {
            window.location.href = data.session_url;
          }
        }
        return data;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch(e) {
      state.error = e.message || t.errorOccurred;
      state.loading = false; render();
      return null;
    }
  }

  // Check if returning from payment (on page load)
  function checkPaymentReturn() {
    var params = new URLSearchParams(window.location.search);
    var paymentStatus = params.get('payment_status');
    var sessionId = params.get('session_id');
    
    if (!paymentStatus) return;
    
    // Clean URL params
    var cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    if (paymentStatus === 'success' && sessionId) {
      // Retrieve saved booking data and finalize
      try {
        var saved = sessionStorage.getItem('asw_pending_booking');
        if (saved) {
          var bookingData = JSON.parse(saved);
          sessionStorage.removeItem('asw_pending_booking');
          finalizeBookingAfterPayment(bookingData, sessionId);
          return;
        }
      } catch(e) {
        console.error('[ASW] Error restoring booking data:', e);
      }
      // No saved data — just show success
      state.view = 'success'; render();
    } else if (paymentStatus === 'cancel') {
      state.error = t.paymentFailed;
      render();
    }
  }

  async function finalizeBookingAfterPayment(bookingData, paymentSessionId) {
    // For slot services (sauna, tub) the preliminary service_orders row
    // created by /api/booking/checkout-session already covers everything —
    // payment-return confirmed it. Just show success.
    //
    // Breakfast is special: the preliminary SO row only captures the total
    // amount, not the per-menu-item details. Restore widget state from
    // bookingData and call book-breakfast (one POST per selected day) so
    // the dashboard sees one booking_service_orders row per (item, date).
    if (bookingData && bookingData.serviceType === 'breakfast') {
      try {
        if (bookingData.itemQty) state.itemQty = bookingData.itemQty;
        if (bookingData.selectedBreakfastDates) state.selectedBreakfastDates = bookingData.selectedBreakfastDates;
        await doSubmitBreakfast(paymentSessionId);
        return;
      } catch (e) {
        console.error('[ASW] finalize breakfast error:', e);
        // Fall through to plain success state — payment succeeded, the
        // operator can see the SO row even if BSO creation failed.
      }
    }
    state.view = 'success';
    state.loading = false; render();
  }

  // ─── Original Submit Logic (extracted) ───
  async function doSubmitSlot(paymentId) {
    var body = {
      action: 'book-slots',
      serviceId: serviceId,
      date: state.date,
      startHour: state.startHour,
      hours: state.hours,
      persons: 1,
    };
    if (RESERVATION_ID) body.reservationId = RESERVATION_ID;
    if (paymentId) body.paymentId = paymentId;
    if (SITE_ID) body.site_id = SITE_ID;
    if (state.promoApplied && state.promoCode) body.promoCode = state.promoCode;
    if (SERVICE_TYPE === 'sauna' && state.brooms > 0) {
      body.addons = [{ id: 'addon_broom', quantity: state.brooms }];
    }

    var res = await fetch(API_BASE + '/api/booking/services', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (!res.ok) { var err = await res.json(); throw new Error(err.error || 'Failed'); }
    state.view = 'success';
    state.loading = false; render();
  }

  async function doSubmitBreakfast(paymentId) {
    var items = [];
    Object.keys(state.itemQty).forEach(function(id) {
      if (state.itemQty[id] > 0) items.push({ menuItemId: id, quantity: state.itemQty[id] });
    });
    if (items.length === 0) { state.error = 'Select at least one item'; state.loading = false; render(); return; }

    // Multi-day breakfast: post once per selected morning. Backend creates
    // separate booking_service_orders rows per day, so the dashboard groups
    // them under the right date instead of bundling on check-in.
    var dates = state.selectedBreakfastDates && state.selectedBreakfastDates.length > 0
      ? state.selectedBreakfastDates
      : [null];

    for (var i = 0; i < dates.length; i++) {
      var body = { action: 'book-breakfast', items: items };
      if (RESERVATION_ID) body.reservationId = RESERVATION_ID;
      if (paymentId) body.paymentId = paymentId;
      if (dates[i]) body.serviceDate = dates[i];

      var res = await fetch(API_BASE + '/api/booking/services', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      if (!res.ok) { var err = await res.json(); throw new Error(err.error || 'Failed'); }
    }

    state.view = 'success';
    state.loading = false; render();
  }

  async function submitSlotBooking() {
    if (!state.date) return;
    var total = getSlotTotal();
    if (ENABLE_PAYMENT && total > 0) {
      var svcName = SERVICE_TYPE === 'sauna' ? t.sauna : t.tub;
      var desc = svcName + ' — ' + state.hours + ' ' + t.hours + ', ' + fmtDisplay(state.date);
      await initiatePayment(total, desc);
    } else {
      state.loading = true; state.error = null; render();
      try { await doSubmitSlot(null); } catch(e) { state.error = e.message || t.errorOccurred; state.loading = false; render(); }
    }
  }

  async function submitBreakfastOrder() {
    if (getBreakfastDailyTotal() <= 0) { state.error = 'Select at least one item'; render(); return; }
    if (STAY_CHECKIN && STAY_CHECKOUT && state.selectedBreakfastDates.length === 0) {
      state.error = t.noDaysSelected; render(); return;
    }
    var total = getBreakfastTotal();
    if (ENABLE_PAYMENT && total > 0) {
      await initiatePayment(total, t.breakfast);
    } else {
      state.loading = true; state.error = null; render();
      try { await doSubmitBreakfast(null); } catch(e) { state.error = e.message || t.errorOccurred; state.loading = false; render(); }
    }
  }

  // ─── Calendar ───
  function onCalDayClick(dateStr) {
    var d = parseDate(dateStr), today = new Date(); today.setHours(0,0,0,0);
    if (d < today) return;
    state.date = dateStr;
    state.calOpen = false;
    render();
  }

  // ─── Render ───
  function render() {
    var h = '';
    if (state.view === 'success') {
      h = renderSuccess();
    } else if (SERVICE_TYPE === 'breakfast') {
      h = renderBreakfast();
    } else {
      h = renderSlotService();
    }
    root.innerHTML = h;
    bindEvents();
  }

  function renderSlotService() {
    var isS = SERVICE_TYPE === 'sauna';
    var icon = isS ? '🔥' : '🛁';
    var title = isS ? t.sauna : t.tub;
    var desc = isS ? t.saunaDesc : t.tubDesc;
    var total = getSlotTotal();
    var h = '';

    h += '<div class="asw-card">';

    // Header
    h += '<div class="asw-header">';
    h += '<div class="asw-icon">' + icon + '</div>';
    h += '<div><div class="asw-title">' + title + '</div>';
    h += '<div class="asw-desc">' + desc + '</div></div>';
    h += '</div>';

    // Price badge
    h += '<div class="asw-price-badge">';
    if (state.promoApplied && state.price < state.originalPrice) {
      h += '<span class="asw-price-original">Kč ' + fmtPrice(state.originalPrice) + '</span>';
      h += '<span class="asw-price-amount asw-price-promo">Kč ' + fmtPrice(state.price) + '</span>';
    } else {
      h += '<span class="asw-price-amount">Kč ' + fmtPrice(state.price) + '</span>';
    }
    h += '<span class="asw-price-unit">' + t.perHour + '</span>';
    h += '</div>';

    // Promo code section
    if (SERVICE_TYPE !== 'breakfast') {
      if (state.promoApplied) {
        h += '<div class="asw-promo-applied">✅ ' + t.promoApplied + ': <strong>' + escHtml(state.promoCode) + '</strong></div>';
      } else {
        h += '<div class="asw-promo-section">';
        h += '<button class="asw-promo-toggle" id="asw-promo-toggle">' + (state.promoOpen ? '▾' : '▸') + ' ' + t.promoLabel + '</button>';
        if (state.promoOpen) {
          h += '<div class="asw-promo-row">';
          h += '<input type="text" class="asw-promo-input" id="asw-promo-input" placeholder="' + t.promoPlaceholder + '" value="' + escHtml(state.promoCode) + '" />';
          h += '<button class="asw-promo-btn" id="asw-promo-apply">' + t.promoApply + '</button>';
          h += '</div>';
          if (state.promoError) {
            h += '<div class="asw-promo-error">' + state.promoError + '</div>';
          }
        }
        h += '</div>';
      }
    }

    if (state.loading) {
      h += '<div class="asw-loading"><div class="asw-spinner"></div></div>';
      h += '</div>';
      return h;
    }

    if (state.error) {
      h += '<div class="asw-error">' + state.error + '</div>';
    }

    // Date selector
    h += '<div class="asw-field-group">';
    h += '<label class="asw-label">' + t.selectDate + '</label>';
    h += '<button class="asw-date-btn" id="asw-date-btn">';
    h += state.date ? fmtDisplay(state.date) : '—';
    h += ' <span class="asw-chevron">▼</span></button>';
    h += '</div>';

    // Calendar popup
    if (state.calOpen) {
      h += renderMiniCalendar();
    }

    // Time slots
    h += '<div class="asw-field-group">';
    h += '<label class="asw-label">' + t.selectTime + '</label>';
    h += '<div class="asw-time-grid">';
    for (var hr = 10; hr <= 20; hr++) {
      var booked = isSlotBooked(hr);
      var selected = hr >= state.startHour && hr < state.startHour + state.hours;
      var cls = 'asw-time-slot';
      if (booked) cls += ' asw-booked';
      if (selected) cls += ' asw-selected';
      h += '<button class="' + cls + '" data-hour="' + hr + '"' + (booked ? ' disabled title="' + t.slotBooked + '"' : '') + '>';
      h += String(hr).padStart(2,'0') + ':00';
      h += '</button>';
    }
    h += '</div></div>';

    // Duration
    h += '<div class="asw-field-group">';
    h += '<label class="asw-label">' + t.duration + ' <span class="asw-hint">(' + t.minHours + ')</span></label>';
    h += '<div class="asw-counter">';
    h += '<button class="asw-counter-btn" id="asw-hours-minus"' + (state.hours <= 2 ? ' disabled' : '') + '>−</button>';
    h += '<span class="asw-counter-val">' + state.hours + ' ' + (state.hours === 1 ? t.hour : t.hours) + '</span>';
    h += '<button class="asw-counter-btn" id="asw-hours-plus"' + (state.hours >= 8 ? ' disabled' : '') + '>+</button>';
    h += '</div></div>';

    // Broom addon (sauna only)
    if (isS && state.addons.length > 0) {
      h += '<div class="asw-field-group">';
      h += '<label class="asw-label">🌿 ' + t.broom + ' <span class="asw-hint">' + fmtPrice(state.broomPrice) + ' Kč</span></label>';
      h += '<div class="asw-counter">';
      h += '<button class="asw-counter-btn" id="asw-broom-minus"' + (state.brooms <= 0 ? ' disabled' : '') + '>−</button>';
      h += '<span class="asw-counter-val">' + state.brooms + '</span>';
      h += '<button class="asw-counter-btn" id="asw-broom-plus"' + (state.brooms >= 5 ? ' disabled' : '') + '>+</button>';
      h += '</div></div>';
    }

    // Divider + Total
    h += '<div class="asw-divider"></div>';
    h += '<div class="asw-total-row">';
    h += '<span class="asw-total-label">' + t.total + '</span>';
    h += '<span class="asw-total-amount">Kč ' + fmtPrice(total) + '</span>';
    h += '</div>';

    // Book / Pay button + optional Add-to-cart button (only when guest
    // page exposed the bridge and we have a reservation context).
    var btnLabel = ENABLE_PAYMENT ? (t.payAmount + ' ' + fmtPrice(total) + ' Kč') : t.addToBooking;
    if (cartBridgeAvailable()) {
      h += '<div class="asw-btn-row">';
      h += '<button class="asw-book-btn asw-book-btn-secondary" id="asw-cart">🛒 ' + t.addToCart + '</button>';
      h += '<button class="asw-book-btn" id="asw-submit">' + btnLabel + '</button>';
      h += '</div>';
    } else {
      h += '<button class="asw-book-btn" id="asw-submit">' + btnLabel + '</button>';
    }
    h += '</div>';
    return h;
  }

  function renderBreakfast() {
    var dailyTotal = getBreakfastDailyTotal();
    var dayCount = getBreakfastDayCount();
    var total = getBreakfastTotal();
    var breakfastDays = getBreakfastDays();
    var h = '';

    h += '<div class="asw-card">';
    h += '<div class="asw-header">';
    h += '<div class="asw-icon">🍳</div>';
    h += '<div><div class="asw-title">' + t.breakfast + '</div>';
    h += '<div class="asw-desc">' + t.breakfastDesc + '</div></div>';
    h += '</div>';

    if (state.loading) {
      h += '<div class="asw-loading"><div class="asw-spinner"></div></div>';
      h += '</div>';
      return h;
    }

    if (state.error) {
      h += '<div class="asw-error">' + state.error + '</div>';
    }

    // Days picker (only when stay window is known and has 2+ mornings)
    if (breakfastDays.length >= 2) {
      h += '<div class="asw-field-group">';
      h += '<label class="asw-label">' + t.breakfastDays + ' <span class="asw-hint">' + t.breakfastDaysHint + '</span></label>';
      h += '<div class="asw-day-grid">';
      breakfastDays.forEach(function(d) {
        var checked = state.selectedBreakfastDates.indexOf(d) !== -1;
        var dObj = parseDate(d);
        var weekdayKeys = ['sun','mon','tue','wed','thu','fri','sat'];
        var wd = t[weekdayKeys[dObj.getDay()]] || '';
        h += '<label class="asw-day-chip' + (checked ? ' asw-day-chip-on' : '') + '" data-day="' + d + '">';
        h += '<span class="asw-day-wd">' + wd + '</span>';
        h += '<span class="asw-day-num">' + dObj.getDate() + '.' + (dObj.getMonth()+1) + '</span>';
        h += '<input type="checkbox" data-day-cb="' + d + '"' + (checked ? ' checked' : '') + ' />';
        h += '</label>';
      });
      h += '</div></div>';
    }

    // Compact menu items
    if (state.menuItems.length === 0) {
      h += '<div class="asw-empty">No menu items available</div>';
    } else {
      h += '<div class="asw-menu-list">';
      state.menuItems.forEach(function(item) {
        var qty = state.itemQty[item.id] || 0;
        var nameKey = 'name' + LANG.charAt(0).toUpperCase() + LANG.slice(1);
        var displayName = item[nameKey] || item.nameEn || item.name;
        var descKey = 'description' + LANG.charAt(0).toUpperCase() + LANG.slice(1);
        var displayDesc = item[descKey] || item.descriptionEn || item.description;

        h += '<div class="asw-menu-row">';
        if (item.photoUrl) {
          h += '<div class="asw-menu-row-photo" style="background-image:url(' + item.photoUrl + ')"></div>';
        } else {
          h += '<div class="asw-menu-row-photo asw-menu-photo-placeholder">🍽️</div>';
        }
        h += '<div class="asw-menu-row-info">';
        h += '<div class="asw-menu-row-name">' + escHtml(displayName) + '</div>';
        if (displayDesc) h += '<div class="asw-menu-row-desc">' + escHtml(displayDesc) + '</div>';
        h += '<div class="asw-menu-row-meta">';
        if (item.weightGrams) h += '<span class="asw-menu-weight">' + item.weightGrams + 'g</span>';
        h += '<span class="asw-menu-price">' + fmtPrice(item.price) + ' Kč' + (dayCount > 1 ? ' ' + t.perDay : '') + '</span>';
        h += '</div>';
        h += '</div>';
        h += '<div class="asw-menu-row-qty">';
        h += '<button class="asw-counter-btn" data-item-minus="' + item.id + '"' + (qty <= 0 ? ' disabled' : '') + '>−</button>';
        h += '<span class="asw-counter-val">' + qty + '</span>';
        h += '<button class="asw-counter-btn" data-item-plus="' + item.id + '">+</button>';
        h += '</div>';
        h += '</div>';
      });
      h += '</div>';
    }

    // Divider + Total
    h += '<div class="asw-divider"></div>';
    if (dayCount > 1 && dailyTotal > 0) {
      h += '<div class="asw-total-sub"><span>' + fmtPrice(dailyTotal) + ' Kč ' + t.perDay + ' × ' + dayCount + '</span></div>';
    }
    h += '<div class="asw-total-row">';
    h += '<span class="asw-total-label">' + t.total + '</span>';
    h += '<span class="asw-total-amount">Kč ' + fmtPrice(total) + '</span>';
    h += '</div>';

    var btnLabel = ENABLE_PAYMENT ? (t.payAmount + ' ' + fmtPrice(total) + ' Kč') : t.order;
    if (cartBridgeAvailable() && total > 0) {
      h += '<div class="asw-btn-row">';
      h += '<button class="asw-book-btn asw-book-btn-secondary" id="asw-cart">🛒 ' + t.addToCart + '</button>';
      h += '<button class="asw-book-btn" id="asw-submit">' + btnLabel + '</button>';
      h += '</div>';
    } else {
      h += '<button class="asw-book-btn" id="asw-submit"' + (total <= 0 ? ' disabled' : '') + '>' + btnLabel + '</button>';
    }
    h += '</div>';
    return h;
  }

  // ─── Cart bridge ────
  // The guest page exposes window.alisioAddToCart when a reservation is
  // present. When absent (standalone widget, or pre-cart session), the
  // cart button is hidden and the widget falls back to direct payment.
  function cartBridgeAvailable() {
    return typeof window.alisioAddToCart === 'function' && !!RESERVATION_ID;
  }

  function buildSlotCartPayload() {
    var isS = SERVICE_TYPE === 'sauna';
    var name = isS ? t.sauna : t.tub;
    var icon = isS ? '🔥' : '🛁';
    var lineTotal = getSlotTotal();
    return {
      type: 'slot',
      serviceId: serviceId,
      serviceName: name,
      icon: icon,
      currency: 'CZK',
      lineTotal: lineTotal,
      pricePerHour: state.price,
      hours: state.hours,
      startHour: state.startHour,
      date: state.date,
      addonBrooms: state.brooms || 0,
      addonBroomPrice: state.broomPrice || 0,
      serviceDates: state.date ? [state.date] : undefined,
    };
  }

  function buildBreakfastCartPayload() {
    var menuPicks = [];
    Object.keys(state.itemQty).forEach(function(id) {
      if ((state.itemQty[id] || 0) > 0) {
        var info = null;
        for (var i = 0; i < state.menuItems.length; i++) {
          if (state.menuItems[i].id === id) { info = state.menuItems[i]; break; }
        }
        if (info) {
          var nameKey = 'name' + LANG.charAt(0).toUpperCase() + LANG.slice(1);
          menuPicks.push({
            menuItemId: id,
            quantity: state.itemQty[id],
            price: info.price,
            name: info[nameKey] || info.nameEn || info.name,
          });
        }
      }
    });
    return {
      type: 'breakfast',
      serviceId: serviceId,
      serviceName: t.breakfast,
      icon: '🍳',
      currency: 'CZK',
      lineTotal: getBreakfastTotal(),
      breakfastMenuItems: menuPicks,
      serviceDates: state.selectedBreakfastDates && state.selectedBreakfastDates.length > 0
        ? state.selectedBreakfastDates.slice() : undefined,
    };
  }

  function submitToCart() {
    if (!cartBridgeAvailable()) return;
    if (SERVICE_TYPE === 'breakfast') {
      if (getBreakfastDailyTotal() <= 0) { state.error = 'Select at least one item'; render(); return; }
      if (STAY_CHECKIN && STAY_CHECKOUT && state.selectedBreakfastDates.length === 0) {
        state.error = t.noDaysSelected; render(); return;
      }
      var ok = window.alisioAddToCart(buildBreakfastCartPayload());
      if (ok !== false) state.view = 'success';
    } else {
      if (!state.date) { state.error = t.selectDate; render(); return; }
      var ok2 = window.alisioAddToCart(buildSlotCartPayload());
      if (ok2 !== false) state.view = 'success';
    }
    render();
  }

  function renderSuccess() {
    var h = '<div class="asw-card asw-success-card">';
    h += '<div class="asw-success-icon">✅</div>';
    h += '<div class="asw-success-title">' + t.success + '</div>';
    h += '<div class="asw-success-msg">' + t.successMsg + '</div>';
    h += '<button class="asw-book-btn asw-outline-btn" id="asw-close">' + t.close + '</button>';
    h += '</div>';
    return h;
  }

  function renderMiniCalendar() {
    var today = new Date(); today.setHours(0,0,0,0);
    var base = new Date(today.getFullYear(), today.getMonth() + state.calMonthOffset, 1);
    var y = base.getFullYear(), m = base.getMonth();

    var h = '<div class="asw-cal-overlay" id="asw-cal-overlay">';
    h += '<div class="asw-cal-popup">';
    h += '<div class="asw-cal-header">';
    h += '<button class="asw-cal-nav" id="asw-cal-prev"' + (state.calMonthOffset <= 0 ? ' disabled' : '') + '>‹</button>';
    h += '<span class="asw-cal-title">' + t.months[m] + ' ' + y + '</span>';
    h += '<button class="asw-cal-nav" id="asw-cal-next">›</button>';
    h += '</div>';

    h += '<div class="asw-cal-weekdays">';
    [t.mon,t.tue,t.wed,t.thu,t.fri,t.sat,t.sun].forEach(function(wd) { h += '<div>' + wd + '</div>'; });
    h += '</div>';

    h += '<div class="asw-cal-grid">';
    var firstDay = getFirstDayMon(y, m);
    for (var i = 0; i < firstDay; i++) h += '<div class="asw-cal-day"></div>';
    var dim = getDaysInMonth(y, m);
    for (var d = 1; d <= dim; d++) {
      var ds = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var dObj = parseDate(ds);
      var isPast = dObj < today;
      var cls = 'asw-cal-day';
      if (isPast) cls += ' asw-past';
      if (ds === state.date) cls += ' asw-cal-selected';
      h += '<button class="' + cls + '" data-cal-date="' + ds + '"' + (isPast ? ' disabled' : '') + '>' + d + '</button>';
    }
    h += '</div></div></div>';
    return h;
  }

  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ─── Events ───
  function bindEvents() {
    bindClick('asw-date-btn', function() { state.calOpen = !state.calOpen; render(); });
    bindClick('asw-cal-overlay', function(e) { if (e.target.id === 'asw-cal-overlay') { state.calOpen = false; render(); } });
    bindClick('asw-cal-prev', function() { state.calMonthOffset = Math.max(0, state.calMonthOffset - 1); render(); });
    bindClick('asw-cal-next', function() { state.calMonthOffset++; render(); });

    // Calendar day clicks
    root.querySelectorAll('[data-cal-date]').forEach(function(btn) {
      btn.addEventListener('click', function() { onCalDayClick(btn.getAttribute('data-cal-date')); });
    });

    // Time slot clicks
    root.querySelectorAll('.asw-time-slot[data-hour]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.startHour = parseInt(btn.getAttribute('data-hour'));
        render();
      });
    });

    // Hour counters
    bindClick('asw-hours-minus', function() { state.hours = Math.max(2, state.hours - 1); render(); });
    bindClick('asw-hours-plus', function() { state.hours = Math.min(8, state.hours + 1); render(); });

    // Broom counters
    bindClick('asw-broom-minus', function() { state.brooms = Math.max(0, state.brooms - 1); render(); });
    bindClick('asw-broom-plus', function() { state.brooms = Math.min(5, state.brooms + 1); render(); });

    // Menu item counters
    root.querySelectorAll('[data-item-plus]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-item-plus');
        state.itemQty[id] = (state.itemQty[id] || 0) + 1; render();
      });
    });
    root.querySelectorAll('[data-item-minus]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-item-minus');
        state.itemQty[id] = Math.max(0, (state.itemQty[id] || 0) - 1); render();
      });
    });

    // Breakfast day chips — toggle inclusion in the dates list
    root.querySelectorAll('[data-day]').forEach(function(label) {
      label.addEventListener('click', function(e) {
        e.preventDefault();
        var d = label.getAttribute('data-day');
        var idx = state.selectedBreakfastDates.indexOf(d);
        if (idx === -1) state.selectedBreakfastDates.push(d);
        else state.selectedBreakfastDates.splice(idx, 1);
        render();
      });
    });

    // Submit
    bindClick('asw-submit', function() {
      if (SERVICE_TYPE === 'breakfast') submitBreakfastOrder();
      else submitSlotBooking();
    });
    // Add-to-cart (only present when the guest page exposed the bridge)
    bindClick('asw-cart', function() { submitToCart(); });

    // Promo code
    bindClick('asw-promo-toggle', function() { state.promoOpen = !state.promoOpen; render(); });
    bindClick('asw-promo-apply', function() {
      var inp = root.querySelector('#asw-promo-input');
      if (inp && inp.value.trim()) {
        state.promoCode = inp.value.trim();
        applyPromoCode(state.promoCode);
      }
    });
    // Enter key on promo input
    var promoInput = root.querySelector('#asw-promo-input');
    if (promoInput) {
      promoInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          state.promoCode = promoInput.value.trim();
          if (state.promoCode) applyPromoCode(state.promoCode);
        }
      });
    }

    // Close success
    bindClick('asw-close', function() {
      state.view = 'card'; state.error = null;
      state.hours = 2; state.brooms = 0;
      state.itemQty = {};
      state.menuItems.forEach(function(item) { state.itemQty[item.id] = 0; });
      render();
    });
  }

  function bindClick(id, fn) {
    var el = root.querySelector('#' + id);
    if (el) el.addEventListener('click', fn);
  }

  // ─── CSS ───
  function buildCSS() {
    return [
      ':host{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--accent:' + ACCENT + ';--bg:#fff;--bg2:#f8f9fa;--text:#1a1a2e;--text2:#6b7280;--border:#e5e7eb;--radius:12px}',
      '.asw-root{max-width:420px;margin:0 auto}',

      // Card
      '.asw-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.06)}',
      '.asw-header{display:flex;align-items:flex-start;gap:14px;margin-bottom:16px}',
      '.asw-icon{font-size:36px;line-height:1}',
      '.asw-title{font-size:20px;font-weight:700;color:var(--text);margin-bottom:2px}',
      '.asw-desc{font-size:13px;color:var(--text2);line-height:1.4}',

      // Price badge
      '.asw-price-badge{display:inline-flex;align-items:baseline;gap:4px;background:var(--bg2);padding:6px 14px;border-radius:8px;margin-bottom:18px}',
      '.asw-price-amount{font-size:22px;font-weight:800;color:var(--text)}',
      '.asw-price-original{font-size:16px;font-weight:600;color:var(--text2);text-decoration:line-through;margin-right:6px}',
      '.asw-price-promo{color:#16a34a}',
      '.asw-price-unit{font-size:13px;color:var(--text2)}',

      // Promo code
      '.asw-promo-section{margin-bottom:16px}',
      '.asw-promo-toggle{background:none;border:none;color:var(--text2);font-size:13px;cursor:pointer;padding:4px 0;font-weight:500}',
      '.asw-promo-toggle:hover{color:var(--text)}',
      '.asw-promo-row{display:flex;gap:8px;margin-top:6px}',
      '.asw-promo-input{flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--bg);color:var(--text);text-transform:uppercase;letter-spacing:1px}',
      '.asw-promo-input:focus{outline:none;border-color:var(--accent)}',
      '.asw-promo-btn{padding:8px 16px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.asw-promo-btn:hover{opacity:.9}',
      '.asw-promo-error{font-size:12px;color:#dc2626;margin-top:4px}',
      '.asw-promo-applied{font-size:13px;color:#16a34a;margin-bottom:14px;padding:6px 12px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0}',

      // Fields
      '.asw-field-group{margin-bottom:16px}',
      '.asw-label{display:block;font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px}',
      '.asw-hint{font-weight:400;color:var(--text2);font-size:12px}',

      // Date button
      '.asw-date-btn{width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:14px;color:var(--text);cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center}',
      '.asw-date-btn:hover{border-color:var(--accent)}',
      '.asw-chevron{font-size:10px;color:var(--text2)}',

      // Time grid
      '.asw-time-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
      '.asw-time-slot{padding:8px 4px;border:1px solid var(--border);border-radius:6px;background:var(--bg);font-size:13px;font-weight:500;color:var(--text);cursor:pointer;text-align:center;transition:all .15s}',
      '.asw-time-slot:hover:not(:disabled){border-color:var(--accent);background:#f0f0ff}',
      '.asw-time-slot.asw-selected{background:var(--accent);color:#fff;border-color:var(--accent)}',
      '.asw-time-slot.asw-booked{background:#fee2e2;color:#991b1b;border-color:#fca5a5;cursor:not-allowed;text-decoration:line-through}',

      // Counter
      '.asw-counter{display:flex;align-items:center;gap:12px}',
      '.asw-counter-btn{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--bg);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}',
      '.asw-counter-btn:hover:not(:disabled){border-color:var(--accent);background:#f0f0ff}',
      '.asw-counter-btn:disabled{opacity:.3;cursor:not-allowed}',
      '.asw-counter-val{font-size:15px;font-weight:600;color:var(--text);min-width:56px;text-align:center}',

      // Divider + total
      '.asw-divider{height:1px;background:var(--border);margin:18px 0}',
      '.asw-total-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}',
      '.asw-total-label{font-size:15px;font-weight:600;color:var(--text)}',
      '.asw-total-amount{font-size:22px;font-weight:800;color:var(--text)}',

      // Book button
      '.asw-book-btn{width:100%;padding:14px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.3px}',
      '.asw-book-btn:hover:not(:disabled){opacity:.9;transform:translateY(-1px)}',
      '.asw-book-btn:disabled{opacity:.4;cursor:not-allowed}',
      '.asw-outline-btn{background:transparent;color:var(--accent);border:2px solid var(--accent)}',
      // Two-button row (Add-to-cart + Pay)
      '.asw-btn-row{display:flex;gap:8px}',
      '.asw-btn-row .asw-book-btn{flex:1;font-size:14px;padding:12px 8px}',
      '.asw-book-btn-secondary{background:transparent;color:var(--accent);border:2px solid var(--accent)}',

      // Error
      '.asw-error{background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}',

      // Loading
      '.asw-loading{display:flex;justify-content:center;padding:40px 0}',
      '.asw-spinner{width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:asw-spin .7s linear infinite}',
      '@keyframes asw-spin{to{transform:rotate(360deg)}}',


      // Success
      '.asw-success-card{text-align:center;padding:40px 24px}',
      '.asw-success-icon{font-size:48px;margin-bottom:12px}',
      '.asw-success-title{font-size:20px;font-weight:700;color:var(--text);margin-bottom:6px}',
      '.asw-success-msg{font-size:14px;color:var(--text2);margin-bottom:24px}',

      // Menu (breakfast) — legacy classes kept for safety
      '.asw-menu-grid{display:flex;flex-direction:column;gap:12px}',
      '.asw-menu-item{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}',
      '.asw-menu-photo{width:60px;height:60px;border-radius:8px;background-size:cover;background-position:center;flex-shrink:0}',
      '.asw-menu-photo-placeholder{display:flex;align-items:center;justify-content:center;background:var(--bg2);font-size:24px}',
      '.asw-menu-info{flex:1;min-width:0}',
      '.asw-menu-name{font-size:14px;font-weight:600;color:var(--text)}',
      '.asw-menu-desc{font-size:12px;color:var(--text2);margin-top:2px}',
      '.asw-menu-weight{font-size:11px;color:var(--text2)}',
      '.asw-menu-price{font-size:14px;font-weight:700;color:var(--text)}',
      '.asw-menu-qty{display:flex;align-items:center;gap:8px;flex-shrink:0}',
      '.asw-menu-qty .asw-counter-btn{width:30px;height:30px;font-size:15px}',
      '.asw-menu-qty .asw-counter-val{min-width:24px;font-size:14px}',

      // Compact menu row (new layout)
      '.asw-menu-list{display:flex;flex-direction:column;gap:8px}',
      '.asw-menu-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}',
      '.asw-menu-row-photo{width:40px;height:40px;border-radius:8px;background-size:cover;background-position:center;flex-shrink:0}',
      '.asw-menu-row-info{flex:1;min-width:0}',
      '.asw-menu-row-name{font-size:13px;font-weight:600;color:var(--text);line-height:1.2}',
      '.asw-menu-row-desc{font-size:11px;color:var(--text2);margin-top:2px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}',
      '.asw-menu-row-meta{display:flex;align-items:center;gap:8px;margin-top:3px}',
      '.asw-menu-row-qty{display:flex;align-items:center;gap:6px;flex-shrink:0}',
      '.asw-menu-row-qty .asw-counter-btn{width:28px;height:28px;font-size:14px}',
      '.asw-menu-row-qty .asw-counter-val{min-width:18px;font-size:13px;text-align:center}',

      // Day chips for breakfast multi-day picker
      '.asw-day-grid{display:flex;flex-wrap:wrap;gap:6px}',
      '.asw-day-chip{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:48px;padding:6px 8px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg);cursor:pointer;user-select:none;transition:all .15s}',
      '.asw-day-chip-on{border-color:var(--accent);background:var(--accent);color:#fff}',
      '.asw-day-chip input{display:none}',
      '.asw-day-wd{font-size:10px;text-transform:uppercase;opacity:.7;font-weight:600}',
      '.asw-day-num{font-size:14px;font-weight:700;margin-top:1px}',

      // Sub-total row (per day × count)
      '.asw-total-sub{font-size:12px;color:var(--text2);text-align:right;margin-bottom:4px}',

      // Calendar overlay
      '.asw-cal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center}',
      '.asw-cal-popup{background:var(--bg);border-radius:16px;padding:20px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2)}',
      '.asw-cal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}',
      '.asw-cal-nav{width:32px;height:32px;border-radius:50%;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}',
      '.asw-cal-nav:disabled{opacity:.3;cursor:not-allowed}',
      '.asw-cal-title{font-size:15px;font-weight:700;color:var(--text)}',
      '.asw-cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px}',
      '.asw-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}',
      '.asw-cal-day{width:100%;aspect-ratio:1;border:none;background:transparent;font-size:13px;color:var(--text);cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center}',
      '.asw-cal-day:hover:not(:disabled){background:var(--bg2)}',
      '.asw-cal-day.asw-past{color:#d1d5db;cursor:not-allowed}',
      '.asw-cal-day.asw-cal-selected{background:var(--accent);color:#fff;font-weight:700}',

      '.asw-empty{padding:24px;text-align:center;color:var(--text2);font-size:14px}',
    ].join('\n');
  }

  // ─── Init ───
  checkPaymentReturn();
  loadServiceData();
})();
