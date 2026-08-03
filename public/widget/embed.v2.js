(function() {
  // 1. Find the script tag that loaded this file
  const script = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  // 2. Get configuration from data attributes
  const siteSlug = script.getAttribute('data-site');
  if (!siteSlug) {
    console.error('ALiSiO Widget Error: data-site attribute is missing.');
    return;
  }
  
  const unitId = script.getAttribute('data-unit') || '';
  const getBrowserLang = () => {
    if (typeof navigator !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.slice(0, 2).toLowerCase();
      if (['uk', 'en', 'cs', 'de'].includes(browserLang)) return browserLang;
    }
    return 'uk'; // Default fallback
  };

  const lang = script.getAttribute('data-lang')
    || (typeof window !== 'undefined' && window.__BOOKING_LANG__)
    || getBrowserLang();
  const baseUrl = script.src.split('/widget/embed.v2.js')[0];

  // 3. Create a unique container for the widget
  const container = document.createElement('div');
  container.className = 'alisio-widget-container';
  container.style.width = '100%';
  container.style.position = 'relative';
  
  // 4. Find where to inject
  const target = document.getElementById('alisio-booking-widget') || 
                 document.getElementById('alisio-booking-container');
                 
  if (target) {
    // Prevent duplicate injection
    if (target.querySelector('.alisio-widget-container')) {
      console.log('ALiSiO Widget already present in target, skipping.');
      return;
    }
    target.appendChild(container);
  } else if (script && script.parentNode) {
    script.parentNode.insertBefore(container, script);
  } else {
    document.body.appendChild(container);
  }

  // 5. UTM Persistence via sessionStorage
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var currentUtms = {};
  if (typeof window !== 'undefined') {
    var pageParams = new URLSearchParams(window.location.search);
    UTM_KEYS.forEach(function(key) {
      var val = pageParams.get(key);
      if (val) currentUtms[key] = val;
    });

    if (Object.keys(currentUtms).length > 0) {
      try { sessionStorage.setItem('alisio_utm', JSON.stringify(currentUtms)); } catch(e) {}
    } else {
      try {
        var storedUtms = sessionStorage.getItem('alisio_utm');
        if (storedUtms) currentUtms = JSON.parse(storedUtms);
      } catch(e) {}
    }
  }

  // 6. Create the iframe
  const iframe = document.createElement('iframe');
  const queryParams = new URLSearchParams({
    unitId: unitId,
    lang: lang,
    embed: 'true',
    v: Date.now() // Cache busting
  });

  // Forward parent window query params (e.g., promo, checkin, checkout)
  if (typeof window !== 'undefined' && window.location.search) {
    const parentParams = new URLSearchParams(window.location.search);
    parentParams.forEach((value, key) => {
      if (!queryParams.has(key)) {
        queryParams.set(key, value);
      }
    });
  }

  // Forward persisted UTM parameters if missing
  UTM_KEYS.forEach(function(key) {
    if (currentUtms[key] && !queryParams.has(key)) {
      queryParams.set(key, currentUtms[key]);
    }
  });

  const url = `${baseUrl}/w/${siteSlug}?${queryParams.toString()}`;
  
  iframe.src = url;
  iframe.style.width = '1px';
  iframe.style.minWidth = '100%';
  iframe.style.height = '1200px'; // Massive initial height
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.style.overflow = 'hidden';
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('frameborder', '0');
  
  container.appendChild(iframe);

  // 7. Robust Resize Listener
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    
    if (e.data.type === 'resize' && e.data.height) {
      // Massive 100px buffer
      const newHeight = parseInt(e.data.height) + 100;
      iframe.style.height = newHeight + 'px';
    }
    
    if (e.data.type === 'alisio:redirect' && e.data.url) {
      // Relay to parent — works both when used directly on a page (parent = window)
      // and when loaded inside a srcdoc iframe (parent = the React host window).
      try { parent.postMessage({ type: 'alisio:redirect', url: e.data.url }, '*'); } catch(pe) {}
      // Also navigate this window as fallback for direct (non-iframe) usage
      if (window === parent) { window.location.href = e.data.url; }
    }
  }, false);

  console.log('ALiSiO Widget V3 Loaded for site:', siteSlug);

  // Track page_view event when embed script loads
  (function trackPageView() {
    var sessionKey = 'alisio_sid';
    var sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
      sessionStorage.setItem(sessionKey, sessionId);
    }

    var payload = {
      site_id: siteSlug,
      session_id: sessionId,
      event_type: 'page_view',
      page: window.location.pathname,
      lang: lang,
      utm_source: currentUtms.utm_source || null,
      utm_medium: currentUtms.utm_medium || null,
      utm_campaign: currentUtms.utm_campaign || null,
    };

    fetch(baseUrl + '/api/widget/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function() {});
  })();
})();
