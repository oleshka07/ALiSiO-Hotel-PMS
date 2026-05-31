(function() {
  'use strict';

  // 1. Find the target container
  const target = document.getElementById('alisio-booking-widget') || 
                 document.getElementById('alisio-booking-container');
                 
  if (!target) {
    console.warn('ALiSiO Booking Widget: Target container (#alisio-booking-widget) not found.');
    return;
  }

  // Prevent duplicate execution
  if (target.getAttribute('data-loaded') === 'true') {
    return;
  }
  target.setAttribute('data-loaded', 'true');

  // 2. Get configurations from container attributes
  const siteSlug = target.getAttribute('data-site');
  if (!siteSlug) {
    console.error('ALiSiO Booking Widget: data-site attribute is missing.');
    return;
  }

  const getBrowserLang = () => {
    if (typeof navigator !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.slice(0, 2).toLowerCase();
      if (['uk', 'en', 'cs', 'de'].includes(browserLang)) return browserLang;
    }
    return 'uk'; // Default fallback
  };

  const lang = target.getAttribute('data-lang') || getBrowserLang();
  const thankYouUrl = target.getAttribute('data-thank-you-url') || '';

  // Get base URL of the script
  const script = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  const apiHost = script ? script.src.split('/widget/native-embed.js')[0] : 'https://pms.alisio.cz';

  // 3. Define function to initialize and render the widget
  function loadAndInitWidget() {
    // Inject Stylesheet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${apiHost}/widget/native-bundle.css?v=${Date.now()}`;
    document.head.appendChild(link);

    // Load JS Bundle
    const bundleScript = document.createElement('script');
    bundleScript.src = `${apiHost}/widget/native-bundle.js?v=${Date.now()}`;
    bundleScript.async = true;
    bundleScript.onload = function() {
      if (window.AlisioBookingWidget) {
        window.AlisioBookingWidget.init({
          target: target,
          siteSlug: siteSlug,
          lang: lang,
          thankYouUrl: thankYouUrl
        });
        console.log('ALiSiO Native Booking Widget mounted successfully.');
      } else {
        console.error('ALiSiO Booking Widget: Failed to initialize AlisioBookingWidget global object.');
      }
    };
    bundleScript.onerror = function() {
      console.error('ALiSiO Booking Widget: Failed to load widget bundle script.');
    };
    document.body.appendChild(bundleScript);
  }

  // 4. Implement Lazy Loading using Intersection Observer
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadAndInitWidget();
          obs.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '200px' // Load widget 200px before it comes into view
    });
    observer.observe(target);
  } else {
    // Fallback if IntersectionObserver is not supported
    loadAndInitWidget();
  }
})();
