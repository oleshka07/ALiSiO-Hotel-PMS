(function() {
  // 1. Find the script tag that loaded this file
  var script = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  // 2. Get configuration from data attributes
  var siteSlug = script.getAttribute('data-site');
  if (!siteSlug) {
    console.error('ALiSiO Widget Error: data-site attribute is missing.');
    return;
  }

  var unitId = script.getAttribute('data-unit') || '';
  var lang = script.getAttribute('data-lang') || 'uk';
  var baseUrl = script.src.split('/embed.v2.js')[0];

  // 3. Create a unique container for the widget
  var container = document.createElement('div');
  container.className = 'alisio-widget-container';
  container.style.width = '100%';
  container.style.position = 'relative';

  // Insert container before the script tag
  script.parentNode.insertBefore(container, script);

  // 4. Create the iframe
  var iframe = document.createElement('iframe');
  var queryParams = new URLSearchParams({
    unitId: unitId,
    lang: lang,
    embed: 'true',
    v: Date.now() // Cache busting
  });

  var url = baseUrl + '/w/' + siteSlug + '?' + queryParams.toString();

  iframe.src = url;
  iframe.style.width = '1px';
  iframe.style.minWidth = '100%';
  iframe.style.height = '700px';
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.style.overflow = 'hidden';
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('frameborder', '0');

  container.appendChild(iframe);

  // 5. Analytics state (populated via postMessage from inside iframe)
  var analytics = { fbPixelId: null, ga4Id: null, tiktokPixelId: null, pixelsInjected: false };

  function injectFbPixel(pixelId) {
    if (window.fbq) return;
    var s = document.createElement('script');
    s.innerHTML = '!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version=\'2.0\';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,\'script\',\'https://connect.facebook.net/en_US/fbevents.js\');fbq(\'init\',\'' + pixelId + '\');fbq(\'track\',\'PageView\');';
    document.head.appendChild(s);
  }

  function injectGa4(ga4Id) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ga4Id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function() { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
    }
    window.gtag('config', ga4Id);
  }

  function injectTiktokPixel(pixelId) {
    if (window.ttq) return;
    var s = document.createElement('script');
    s.innerHTML = '!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDequeue=function(e){ttq[e]=function(){ttq.instance(ttq._i[0]).then(function(i){i[e].apply(i,arguments)})}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDequeue(ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",r=document.createElement("script");r.type="text/javascript",r.async=!0,r.src=i;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(r,s),ttq._i=ttq._i||{},ttq._i[e]=[],ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};for(var a=function(e){return function(){ttq.instance(e).then(function(t){t[e].apply(t,arguments)})}},o=0;o<ttq.methods.length;o++)ttq[ttq.methods[o]]=a(ttq.methods[o])},ttq.load("' + pixelId + '"),ttq.page()}(window,document,"ttq");';
    document.head.appendChild(s);
  }

  // 6. Message listener: handles resize, analytics config, purchase, UTM
  window.addEventListener('message', function(e) {
    if (!e.data) return;

    // ── Resize ────────────────────────────────────
    if (e.data.type === 'resize' && e.data.height) {
      if (e.source === iframe.contentWindow) {
        iframe.style.height = e.data.height + 'px';
      }
    }

    if (!e.data.source || e.data.source !== 'alisio-widget') return;

    // ── UTM request from iframe ───────────────────
    if (e.data.event === 'request_utm') {
      var UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ttclid'];
      var own = new URLSearchParams(window.location.search);
      var utm = {};
      UTM_KEYS.forEach(function(k) { var v = own.get(k); if (v) utm[k] = v; });
      if (e.source) {
        e.source.postMessage({ source: 'alisio-parent', event: 'utm_params', utm: utm }, '*');
      }
    }

    // ── Analytics config from iframe ──────────────
    if (e.data.event === 'analytics_config' && !analytics.pixelsInjected) {
      analytics.pixelsInjected = true;
      if (e.data.fbPixelId)     { analytics.fbPixelId = e.data.fbPixelId;       injectFbPixel(e.data.fbPixelId); }
      if (e.data.ga4Id)         { analytics.ga4Id = e.data.ga4Id;               injectGa4(e.data.ga4Id); }
      if (e.data.tiktokPixelId) { analytics.tiktokPixelId = e.data.tiktokPixelId; injectTiktokPixel(e.data.tiktokPixelId); }
    }

    // ── Purchase event from iframe ────────────────
    if (e.data.event === 'purchase') {
      var val      = e.data.value    || 0;
      var currency = e.data.currency || 'CZK';
      var eventId  = e.data.eventId  || ('booking_' + (e.data.reservationId || Date.now()));

      // Meta Pixel
      if (window.fbq && analytics.fbPixelId) {
        window.fbq('track', 'Purchase', { value: val, currency: currency }, { eventID: eventId });
      }
      // GA4
      if (window.gtag && analytics.ga4Id) {
        window.gtag('event', 'purchase', { transaction_id: e.data.reservationId, value: val, currency: currency });
      }
      // TikTok
      if (window.ttq && typeof window.ttq.track === 'function' && analytics.tiktokPixelId) {
        window.ttq.track('CompletePayment', { value: val, currency: currency, content_id: e.data.reservationId || eventId });
      }
    }

  }, false);

  console.log('ALiSiO Widget V3 Loaded for site:', siteSlug);
})();
