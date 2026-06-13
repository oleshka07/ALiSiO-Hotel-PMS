/**
 * ALiSiO Form Collector — v1.1
 * Paste this snippet inside <head> of your website.
 * It automatically listens to all <form> submissions and forwards
 * the data to ALiSiO CRM. No server-side changes needed.
 *
 * Usage (auto-capture — all forms on page):
 *   <script src="https://YOUR_ALISIO_DOMAIN/widget/collector.js"
 *           data-site-id="YOUR_SITE_ID" async defer></script>
 *
 * Manual usage (React / SPA — call directly on form submit):
 *   Alisio.sendForm({
 *     name:    'Jan Novák',
 *     email:   'jan@example.com',
 *     phone:   '+420 723 000 000',
 *     message: 'Dobrý den, mám dotaz...'
 *   });
 */
(function () {
  'use strict';

  var ENDPOINT = (function () {
    var scripts = document.querySelectorAll('script[data-site-id]');
    var el = scripts[scripts.length - 1];
    var src = el ? el.src : '';
    var base = src.replace(/\/widget\/collector\.js.*$/, '');
    return base + '/api/public/capture';
  })();

  var SITE_ID = (function () {
    var scripts = document.querySelectorAll('script[data-site-id]');
    var el = scripts[scripts.length - 1];
    return el ? el.getAttribute('data-site-id') : null;
  })();

  if (!SITE_ID) {
    console.warn('[ALiSiO] collector.js: data-site-id attribute missing on <script> tag.');
    return;
  }

  // Honeypot field name (must match server-side constant)
  var HP = '_hp_trap';

  function send(data) {
    data.siteId = SITE_ID;
    data._hp_trap = ''; // empty = human
    data.sourceUrl = window.location.href;
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true,
    }).then(function (res) {
      return res.json();
    }).catch(function () { /* silent */ });
  }

  function serializeForm(form) {
    var obj = {};
    var fields = form.elements;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.name || f.disabled || f.type === 'submit' || f.type === 'button' || f.type === 'reset' || f.name === HP) continue;
      if ((f.type === 'checkbox' || f.type === 'radio') && !f.checked) continue;
      obj[f.name] = f.value || '';
    }
    return obj;
  }

  function handleSubmit(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var data = serializeForm(form);
    send(data);
  }

  document.addEventListener('submit', handleSubmit, true);

  // Public API for manual usage
  window.Alisio = window.Alisio || {};
  window.Alisio.sendForm = send;
})();
