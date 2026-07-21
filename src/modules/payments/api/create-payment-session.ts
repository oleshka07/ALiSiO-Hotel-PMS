/**
 * @payments — createPaymentSession
 *
 * Single entry point for all Teya payment session creation.
 * Store selection priority:
 *   1. intent.credentials  → per-site creds from booking_sites.payment_config
 *   2. TEYA_STORE (env)    → 'camping' | 'glamping' | 'main'
 *   3. default             → 'main' (TEYA_CLIENT_ID / TEYA_CLIENT_SECRET / TEYA_STORE_ID)
 */
import crypto from 'crypto';
import type { PaymentIntent, PaymentSession, TeyaCredentials } from '../domain/types';

// ─── Environment ──────────────────────────────────────────────────────────────
const IS_PRODUCTION = (process.env.TEYA_ENVIRONMENT || 'staging') === 'production';
const TEYA_API_URL = IS_PRODUCTION ? 'https://api.teya.com' : 'https://api.teya.xyz';
const TEYA_OAUTH_URL = IS_PRODUCTION
  ? 'https://id.teya.com/oauth/v2/oauth-token'
  : 'https://id.teya.xyz/oauth/v2/oauth-token';

// ─── Store map (internal — not part of public PaymentIntent API) ──────────────
type TeyaStoreKey = 'main' | 'camping' | 'glamping';

const STORES: Record<TeyaStoreKey, TeyaCredentials> = {
  main: {
    client_id: process.env.TEYA_CLIENT_ID || '',
    client_secret: process.env.TEYA_CLIENT_SECRET || '',
    store_id: process.env.TEYA_STORE_ID || '',
  },
  camping: {
    client_id: process.env.TEYA_CAMPING_CLIENT_ID || process.env.TEYA_CLIENT_ID || '',
    client_secret: process.env.TEYA_CAMPING_CLIENT_SECRET || process.env.TEYA_CLIENT_SECRET || '',
    store_id: process.env.TEYA_CAMPING_STORE_ID || process.env.TEYA_STORE_ID || '',
  },
  glamping: {
    client_id: process.env.TEYA_GLAMPING_CLIENT_ID || process.env.TEYA_CLIENT_ID || '',
    client_secret: process.env.TEYA_GLAMPING_CLIENT_SECRET || process.env.TEYA_CLIENT_SECRET || '',
    store_id: process.env.TEYA_GLAMPING_STORE_ID || process.env.TEYA_STORE_ID || '',
  },
};

export function getEnvStore(key: TeyaStoreKey): TeyaCredentials {
  return STORES[key] ?? STORES.main;
}

export function getDefaultStore(): TeyaCredentials {
  const key = (process.env.TEYA_STORE || 'main') as TeyaStoreKey;
  return getEnvStore(key);
}

// ─── HTTP with timeout ────────────────────────────────────────────────────────
const CHECKOUT_SCOPE = 'checkout/sessions/create';

async function teyaFetch(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Token cache (per client_id + scope) ──────────────────────────────────────
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  const cacheKey = `${clientId}::${CHECKOUT_SCOPE}`;
  if (!opts.force) {
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.token;
  }

  if (!clientId || !clientSecret) {
    throw new Error('[payments] Teya credentials not configured. Check TEYA_CLIENT_ID / TEYA_CLIENT_SECRET in .env.local');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: CHECKOUT_SCOPE,
  });

  const res = await teyaFetch(TEYA_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[payments] Teya OAuth failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a Teya Checkout Session.
 * This is the ONLY function modules should call — do NOT import from @/lib/teya.
 *
 * @example
 *   const session = await createPaymentSession({
 *     kind: 'booking_full',
 *     amount: 1200,
 *     currency: 'CZK',
 *     description: 'Booking #123',
 *     metadata: { reservation_id: '...' },
 *   });
 *   redirect(session.sessionUrl);
 */
export async function createPaymentSession(intent: PaymentIntent): Promise<PaymentSession> {
  // Resolve credentials: explicit intent.credentials > env TEYA_STORE > 'main'
  // const creds: TeyaCredentials = intent.credentials ?? getDefaultStore();
  const creds: TeyaCredentials = intent.credentials ?? getDefaultStore();

  console.log('[Teya CREDS DEBUG]', {
    client_id: creds.client_id ? 'YES' : 'NO',
    client_secret: creds.client_secret ? 'YES' : 'NO',
    store_id: creds.store_id,
  });

  if (!creds.client_id || !creds.store_id) {
    throw new Error('[payments] No Teya credentials. Configure TEYA_CLIENT_ID, TEYA_CLIENT_SECRET, TEYA_STORE_ID in .env.local');
  }

  // amount: major units → minor units (×100)
  const amountMinor = Math.round(intent.amount * 100);

  const payload: Record<string, unknown> = {
    store_id: creds.store_id,
    amount: { currency: intent.currency ?? 'CZK', value: amountMinor },
    type: 'SALE',
  };

  if (intent.lineItems?.length) {
    payload.line_items = intent.lineItems.map(li => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: Math.round(li.unitPriceMajor * 100),
    }));
  } else {
    payload.line_items = [{ description: intent.description, quantity: 1, unit_price: amountMinor }];
  }

  if (intent.metadata) payload.metadata = intent.metadata;
  if (intent.successUrl) {
    payload.success_url = intent.successUrl;
    payload.return_url = intent.successUrl; // Teya API v2 sometimes expects return_url
  }
  if (intent.cancelUrl) payload.cancel_url = intent.cancelUrl;
  if (intent.expiresAt) payload.expires_at = intent.expiresAt;

  const idempotencyKey = crypto.randomUUID();
  const doPost = (token: string) =>
    teyaFetch(`${TEYA_API_URL}/v2/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

  let accessToken = await getAccessToken(creds.client_id, creds.client_secret);
  let res = await doPost(accessToken);

  // Stale/invalid token → refresh once and retry (same idempotency key)
  if (res.status === 401 || res.status === 403) {
    accessToken = await getAccessToken(creds.client_id, creds.client_secret, { force: true });
    res = await doPost(accessToken);
  }

  if (!res.ok) {
    const txt = await res.text();
    console.error('[payments] Teya checkout error:', res.status, txt);
    throw new Error(`[payments] Teya checkout session failed: ${res.status} ${txt}`);
  }

  const data = await res.json();

  return {
    sessionId: data.session_id,
    sessionToken: data.session_token,
    sessionUrl: data.session_url,
    provider: 'teya',
    intentKind: intent.kind,
  };
}
