# ALiSiO PMS — Native JS Embed Booking Widget Implementation Plan

This document outlines the architectural design, security measures, and implementation steps to support a **Native JS Embed Booking Widget** (Option 1 - Light DOM Injection) while preserving full backward compatibility with the existing **Iframe Booking Widget**.

---

## 1. Architecture Overview

To support Microsoft Clarity, Facebook Pixel, and Google Tag Manager (GTM) event tracking, the widget must run directly in the host website's DOM. 

We will introduce a **Unified Script Loader** (`native-embed.js`) and a **Standalone Compiled Bundle** (`native-bundle.js` + `native-bundle.css`) while keeping the Next.js `/w/[siteSlug]` page route intact for iframe backwards compatibility.

```
┌────────────────────────────────────────────────────────────────────────┐
│ HOST WEBSITE (e.g., glamping.cz)                                       │
│                                                                        │
│  Option A (Existing): <iframe src="https://pms.cz/w/glamping-vip">     │
│  Option B (New):      <div id="alisio-booking-widget" data-site="vip"> │
│                       └─► Dynamic Injection (Light DOM)                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Fetch Assets & API Requests
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ ALiSiO PMS BACKEND (pms.cz)                                            │
│                                                                        │
│  - Static Assets: /public/widget/native-embed.js                       │
│                  /public/widget/native-bundle.js & native-bundle.css   │
│  - API Endpoints: /api/booking/availability                            │
│                  /api/booking/reserve                                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Coexistence & Backward Compatibility

Existing clients who currently use iframes must experience zero disruption.

* **Existing Iframes:** Keep the file `src/app/w/[siteSlug]/page.tsx` and all related routing. They will continue to work perfectly.
* **Unified Entry Points:** The core booking component (`BookingV2.tsx`) will be shared between both the Next.js page route (used by iframes) and the standalone bundled version (used by native embeds).

---

## 3. Implementation Blueprint

### Step A: The Loader Script (`public/widget/native-embed.js`)
This lightweight loader is placed on the client's site. It detects the target container, loads the React widget bundle dynamically, and injects it into the DOM.

```javascript
(function() {
  const container = document.getElementById('alisio-booking-widget');
  if (!container) return;

  const siteSlug = container.getAttribute('data-site');
  const lang = container.getAttribute('data-lang') || 'uk';
  const apiHost = container.getAttribute('data-api-url') || 'https://pms.alisio.cz';

  // 1. Inject Stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${apiHost}/widget/native-bundle.css`;
  document.head.appendChild(link);

  // 2. Load and Mount Bundle
  const script = document.createElement('script');
  script.src = `${apiHost}/widget/native-bundle.js`;
  script.async = true;
  script.onload = function() {
    if (window.AlisioBookingWidget) {
      window.AlisioBookingWidget.init({
        target: container,
        siteSlug: siteSlug,
        lang: lang,
        apiUrl: apiHost
      });
    }
  };
  document.body.appendChild(script);
})();
```

### Step B: Build/Compilation Script
We will add a mini bundler script (using `esbuild` or `vite` configured for library mode) that compiles `BookingV2.tsx` and its dependencies into static assets in the `/public` folder:
* Output JS: `public/widget/native-bundle.js`
* Output CSS: `public/widget/native-bundle.css`

---

## 4. Cybersecurity Blueprint 🛡️

Exposing transactional endpoints (`/reserve`, `/availability`) directly to third-party client domains raises security challenges. We will address them systematically:

### 4.1 CORS Protection (Cross-Origin Resource Sharing)
* **Risk:** Anyone could make a custom script that calls our API to spam bookings.
* **Solution:** Do NOT use `Access-Control-Allow-Origin: *`.
* **Implementation:** The backend will validate the `Origin` header of incoming requests against a whitelist of allowed domains mapped to the corresponding `siteSlug` in the database (`properties` or `sites` table).
```typescript
// CORS Handler on API Endpoints
const origin = req.headers.origin;
const allowedDomains = await db.getAllowedDomainsForSlug(siteSlug);

if (origin && allowedDomains.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
} else {
  res.status(403).json({ error: 'Origin not allowed' });
}
```

### 4.2 Rate Limiting & Anti-Brute-Force (Github Anti-Spam Compliant)
* **Risk:** Automated scripts brute-forcing coupon/certificate codes or spamming reservations to lock database availability.
* **Solution:** Implement rate limiting based on IP and site slug.
* **Important Information Compliance:** In accordance with the project's security and GitHub anti-spam rules:
  * Do NOT use files/endpoints containing terms like `promo-code`, `generator`, or `vouchers`.
  * Rename internal variables and routes:
    * `/api/booking/promocode` ➔ `/api/booking/special-offers`
    * Variable `promoCode` ➔ `coupon` or `offerCode`
    * Variable `discount_value` ➔ `offerAmount`

### 4.3 CSRF & Replay Attack Prevention
* **Risk:** Replay attacks where reservations are sent directly via API scripts bypassing user forms.
* **Solution:** Use request signature tokens. When loading the widget, fetch a short-lived cryptographically signed token (`token` or `sid`) via `GET /api/booking/handshake`. This token must be passed in the headers of all subsequent requests (`/availability`, `/reserve`) and is verified server-side.

### 4.4 Data Sanitization
* **Risk:** SQL injection (SQLite via `better-sqlite3`) and XSS injection via guest names, email, and coupon inputs.
* **Solution:** Explicit type validation (using schemas like `zod`), escaping strings, and utilizing parameterized queries inside SQLite transactions.

---

## 5. Performance Optimization

* **Intersection Observer (Lazy Load):** The loader script can defer loading the React bundle (`alisio-widget.js`) until the target element `#alisio-booking-widget` is close to the viewport, saving bandwidth for the host site.
* **Caching Headers:** Configure Nginx/Vercel cache headers for static files under `public/`:
  `Cache-Control: public, max-age=31536000, immutable`

---

## 6. Comparison Table: Embed Methods

| Feature | Iframe Embed (Classic) | Native JS Embed (Option 1) |
| :--- | :--- | :--- |
| **Microsoft Clarity tracking** | ❌ Blocked (Sandbox) |  **Full Tracking** |
| **GTM / Pixel Event binding** | ❌ Blocked (Cross-Origin) |  **Fully Supported** |
| **CSS Isolation** |  **100% Isolated** | ⚠️ Needs Class Prefixes |
| **Authentication/Session** | Simple (Cookies) | Token-based (Bearer) |
| **Installation complexity** | Extremely Simple | Simple |
| **Backward Compatibility** | Yes | Yes |
