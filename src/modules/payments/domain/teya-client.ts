import crypto from 'crypto';

const TEYA_ENV = process.env.TEYA_ENVIRONMENT || 'staging';
const IS_PRODUCTION = TEYA_ENV === 'production';

const TEYA_API_URL = IS_PRODUCTION ? 'https://api.teya.com' : 'https://api.teya.xyz';
const TEYA_OAUTH_URL = IS_PRODUCTION
  ? 'https://id.teya.com/oauth/v2/oauth-token'
  : 'https://id.teya.xyz/oauth/v2/oauth-token';

const TEYA_CLIENT_ID = process.env.TEYA_CLIENT_ID || '';
const TEYA_CLIENT_SECRET = process.env.TEYA_CLIENT_SECRET || '';
const TEYA_STORE_ID = process.env.TEYA_STORE_ID || '';

// Per-scope token cache. A token issued for one scope (e.g. transactions/list
// or refunds/create) must NEVER be reused for checkout — Teya rejects it with
// 403. Keyed by scope so scopes can't poison each other.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

// Hard timeout on every Teya HTTP call, so a slow/hung Teya surfaces a clean
// error instead of the request hanging until nginx returns a 502.
async function teyaFetch(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Teya request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTeyaToken(
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });
  const res = await teyaFetch(TEYA_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya OAuth] Error:', res.status, errorText);
    throw new Error(`Teya OAuth failed: ${res.status} ${errorText}`);
  }
  return res.json();
}

export async function getTeyaAccessToken(
  scope = 'checkout/sessions/create',
  opts?: { force?: boolean },
): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(scope);
  if (!opts?.force && cached && now < cached.expiresAt) {
    return cached.token;
  }
  if (!TEYA_CLIENT_ID || !TEYA_CLIENT_SECRET) {
    throw new Error('Teya credentials not configured. Set TEYA_CLIENT_ID and TEYA_CLIENT_SECRET in .env.local');
  }
  const data = await fetchTeyaToken(TEYA_CLIENT_ID, TEYA_CLIENT_SECRET, scope);
  tokenCache.set(scope, { token: data.access_token, expiresAt: now + (data.expires_in - 60) * 1000 });
  console.log('[Teya] Access token obtained for scope', scope, '— expires in', data.expires_in, 's');
  return data.access_token;
}

export async function getTeyaAccessTokenWithCreds(
  clientId: string,
  clientSecret: string,
  scope = 'checkout/sessions/create',
): Promise<string> {
  const data = await fetchTeyaToken(clientId, clientSecret, scope);
  return data.access_token;
}

export interface TeyaLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CheckoutSessionOptions {
  amount: number;
  currency?: string;
  description?: string;
  items?: TeyaLineItem[];
  metadata?: Record<string, string>;
  success_url?: string;
  cancel_url?: string;
  expiresAt?: string;
  credentials?: {
    client_id: string;
    client_secret: string;
    store_id: string;
  };
}

export interface CheckoutSessionResult {
  id: string;
  session_token: string;
  session_url?: string;
  status: string;
}

export async function createCheckoutSession(opts: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
  const getToken = (force: boolean) => opts.credentials
    ? getTeyaAccessTokenWithCreds(opts.credentials.client_id, opts.credentials.client_secret)
    : getTeyaAccessToken('checkout/sessions/create', { force });

  const storeId = opts.credentials?.store_id || TEYA_STORE_ID;

  const payload: Record<string, unknown> = {
    store_id: storeId,
    amount: {
      currency: opts.currency || 'CZK',
      value: opts.amount,
    },
    type: 'SALE',
  };

  if (opts.items && opts.items.length > 0) {
    payload.line_items = opts.items;
  } else if (opts.description) {
    payload.line_items = [{
      description: opts.description,
      quantity: 1,
      unit_price: opts.amount,
    }];
  }

  if (opts.metadata) {
    payload.metadata = opts.metadata;
  }

  if (opts.success_url) {
    payload.success_url = opts.success_url;
  }
  if (opts.cancel_url) {
    payload.cancel_url = opts.cancel_url;
  }
  if (opts.expiresAt) {
    payload.expires_at = opts.expiresAt;
  }

  const doPost = (token: string) => teyaFetch(`${TEYA_API_URL}/v2/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  let res = await doPost(await getToken(false));
  // A cached token can be stale or issued for the wrong scope → Teya answers
  // 401/403. Drop it, fetch a fresh checkout-scoped token and retry once.
  if (res.status === 401 || res.status === 403) {
    console.warn('[Teya Checkout] got', res.status, '— refreshing token and retrying once');
    res = await doPost(await getToken(true));
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya Checkout] Error:', res.status, errorText);
    throw new Error(`Teya checkout session failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  const sessionId = data.session_id || data.id || data.checkout_session_id;
  console.log('[Teya] Checkout session created:', sessionId, '| raw keys:', Object.keys(data).join(','));
  return {
    id: sessionId,
    session_token: data.session_token,
    session_url: data.session_url,
    status: data.status || 'OPEN',
  };
}

// ─── Pay-by-Link ─────────────────────────────────────────────────────────────

export interface PaymentLinkOptions {
  amount: number;                 // minor units
  currency?: string;
  description?: string;
  items?: TeyaLineItem[];
  /** Our own reference (reservation id) — echoed back in the webhook for auto-linking. */
  merchantReference?: string;
  metadata?: Record<string, string>;
  credentials?: { client_id: string; client_secret: string; store_id: string };
}

export interface PaymentLinkResult { id: string; url: string; status: string; }

/**
 * Create a Teya Pay-by-Link. Deliberately sends NO expires_at → the link never
 * expires (operator requirement). merchant_reference carries the reservation id
 * so the payment.succeeded webhook can auto-link it to the booking.
 */
export async function createPaymentLink(opts: PaymentLinkOptions): Promise<PaymentLinkResult> {
  const getToken = (force: boolean) => opts.credentials
    ? getTeyaAccessTokenWithCreds(opts.credentials.client_id, opts.credentials.client_secret, 'payment-links/create')
    : getTeyaAccessToken('payment-links/create', { force });

  const storeId = opts.credentials?.store_id || TEYA_STORE_ID;
  const payload: Record<string, unknown> = {
    store_id: storeId,
    amount: { currency: opts.currency || 'CZK', value: opts.amount },
    // PaymentLinkType (NOT the checkout SALE/REFUND transaction type). Teya
    // pay-by-links are single-use; combined with no expires_at below the link
    // never expires but can only be paid once — exactly what a reservation needs.
    type: 'SINGLE_USE',
    line_items: (opts.items && opts.items.length)
      ? opts.items
      : [{ description: opts.description || 'Platba', quantity: 1, unit_price: opts.amount }],
  };
  if (opts.merchantReference) payload.merchant_reference = opts.merchantReference;
  if (opts.metadata) payload.metadata = opts.metadata;
  // NOTE: no expires_at → unlimited link lifetime (intentional).

  const doPost = (token: string) => teyaFetch(`${TEYA_API_URL}/v2/payment-links`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  let res = await doPost(await getToken(false));
  if (res.status === 401 || res.status === 403) {
    console.warn('[Teya PayLink] got', res.status, '— refreshing token and retrying once');
    res = await doPost(await getToken(true));
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya PayLink] Error:', res.status, errorText);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Teya payment-link rejected (${res.status}). Ваші креди не мають scope 'payment-links/create' — додайте його в Teya Business Portal (Integrations).`);
    }
    throw new Error(`Teya payment-link failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  const id = data.id || data.payment_link_id || data.link_id;
  const url = data.url || data.payment_link_url || data.link_url;
  console.log('[Teya] Payment link created:', id, '| keys:', Object.keys(data).join(','));
  return { id, url, status: data.status || 'ACTIVE' };
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const rawKey = process.env.TEYA_WEBHOOK_PUBLIC_KEY;
  if (!rawKey) {
    console.warn('[Teya Webhook] No public key configured, skipping verification');
    return true;
  }

  try {
    const pemKey = rawKey.startsWith('-----BEGIN')
      ? rawKey
      : `-----BEGIN PUBLIC KEY-----\n${rawKey}\n-----END PUBLIC KEY-----`;

    const verifier = crypto.createVerify('SHA256');
    verifier.update(body);
    return verifier.verify(pemKey, signature, 'base64');
  } catch (err) {
    console.error('[Teya Webhook] Signature verification failed:', err);
    return false;
  }
}

export async function refundPayment(transactionId: string, amount: number): Promise<{ id: string; status: string }> {
  const token = await getTeyaAccessToken('refunds/create');

  const res = await fetch(`${TEYA_API_URL}/v3/refunds`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transaction_id: transactionId,
      amount,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya Refund] Error:', res.status, errorText);
    throw new Error(`Teya refund failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  console.log('[Teya] Refund issued:', data.id);
  return { id: data.id, status: data.status };
}

// ─────────────────────────────────────────────────────────────────
// Transaction listing (PR #24) — for periodic reconciliation against
// fin_operations to catch payments that bypassed PMS (POS terminal,
// in-app, restaurant). Webhook coverage is event-driven and can miss
// payments initiated outside our checkout flow; API listing closes
// that gap.
//
// IMPORTANT: requires the Teya app to grant the `transactions/list`
// OAuth scope. If you get 401/403 errors here, log into the Teya
// developer portal and add that scope to the app's grants.
// ─────────────────────────────────────────────────────────────────

export interface TeyaTransaction {
  id: string;
  status: string;
  type: string;
  amount: number;
  currency: string;
  created_at: string;
  store_id?: string;
  reference?: string | null;
  description?: string | null;
  customer_email?: string | null;
  metadata?: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface ListTransactionsOptions {
  from: string;       // YYYY-MM-DD
  to: string;         // YYYY-MM-DD
  storeId?: string;   // defaults to TEYA_STORE_ID env
  status?: string;    // optional filter, e.g. 'SUCCEEDED'
  limit?: number;
  cursor?: string;
}

/**
 * List transactions from Teya for a date range. Tries GET /v2/transactions
 * first (REST convention), falls back to POST /v2/transactions/search if
 * that 404s. The response shape varies between staging/production and Teya's
 * various API versions; we normalise into TeyaTransaction.
 *
 * Returns up to opts.limit (default 200) per call. Subsequent pages can be
 * fetched by passing the returned `next_cursor` as `cursor`.
 */
export async function listTeyaTransactions(opts: ListTransactionsOptions): Promise<{
  transactions: TeyaTransaction[];
  next_cursor: string | null;
  total: number | null;
}> {
  const token = await getTeyaAccessToken('transactions/list');
  const storeId = opts.storeId || TEYA_STORE_ID;
  const limit = Math.min(500, opts.limit || 200);

  const qs = new URLSearchParams();
  if (storeId) qs.set('store_id', storeId);
  qs.set('from', opts.from);
  qs.set('to', opts.to);
  qs.set('limit', String(limit));
  if (opts.cursor) qs.set('cursor', opts.cursor);
  if (opts.status) qs.set('status', opts.status);

  // Try GET first (most common REST pattern)
  let res = await fetch(`${TEYA_API_URL}/v2/transactions?${qs}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  // Fallback to POST /search if GET returns 404 (some Teya tenants use that)
  if (res.status === 404) {
    res = await fetch(`${TEYA_API_URL}/v2/transactions/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        store_id: storeId,
        from: opts.from,
        to: opts.to,
        limit,
        cursor: opts.cursor,
        status: opts.status,
      }),
    });
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya List] Error:', res.status, errorText);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Teya transactions API rejected: ${res.status}. Add the 'transactions/list' OAuth scope to your Teya app, then retry.`);
    }
    throw new Error(`Teya transactions list failed: ${res.status} ${errorText}`);
  }

  const data: any = await res.json();

  // Normalise response shapes — Teya returns either { items, next_cursor }
  // or { transactions, page_token } depending on API version.
  const rawList: any[] = data.items || data.transactions || data.data || [];
  const nextCursor: string | null = data.next_cursor || data.page_token || null;
  const total: number | null = data.total ?? data.total_count ?? null;

  const transactions: TeyaTransaction[] = rawList.map((r: any) => ({
    id: r.id || r.transaction_id || r.transactionId || '',
    status: r.status || 'UNKNOWN',
    type: r.type || r.transaction_type || 'SALE',
    amount: typeof r.amount === 'object' ? Number(r.amount.value) : Number(r.amount || 0),
    currency: typeof r.amount === 'object' ? r.amount.currency : (r.currency || 'CZK'),
    created_at: r.created_at || r.createdAt || r.timestamp || r.completed_at || '',
    store_id: r.store_id || r.storeId,
    reference: r.reference || r.session_id || null,
    description: r.description || (r.line_items?.[0]?.description) || null,
    customer_email: r.customer_email || r.customer?.email || null,
    metadata: r.metadata || {},
    raw: r,
  }));

  return { transactions, next_cursor: nextCursor, total };
}

export async function sendReceipt(transactionId: string, email: string): Promise<void> {
  const token = await getTeyaAccessToken('transactions/id/receipts/create');

  const res = await fetch(`${TEYA_API_URL}/v1/transactions/${transactionId}/receipts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Teya Receipt] Error:', res.status, errorText);
  } else {
    console.log('[Teya] Receipt sent to', email);
  }
}
