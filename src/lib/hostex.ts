/**
 * Hostex.io API Client v3
 * Channel manager integration for ALiSiO PMS
 */
import https from 'https';

const HOSTEX_BASE = 'api.hostex.io';
const HOSTEX_API_VERSION = '/v3';
const HOSTEX_TOKEN = process.env.HOSTEX_ACCESS_TOKEN;
if (!HOSTEX_TOKEN) {
  console.error('[Hostex] CRITICAL: HOSTEX_ACCESS_TOKEN environment variable is not set!');
}

// ─── Types ────────────────────────────────────────────────
export interface HostexRate {
  currency: string;
  amount: number;
}

export interface HostexRateDetail {
  type: string; // ACCOMMODATION, HOST_SERVICE_FEE, CLEANING_FEE
  description: string;
  currency: string;
  amount: number;
}

export interface HostexRates {
  total_rate: HostexRate | null;
  total_commission: HostexRate | null;
  rate: HostexRate | null;
  commission: HostexRate | null;
  details: HostexRateDetail[];
}

export interface HostexGuest {
  id: number;
  name: string;
  phone: string;
  email: string;
  id_type: string | null;
  id_number: string | null;
  gender: string | null;
  country: string | null;
  is_booker: boolean;
}

export interface HostexCheckInDetails {
  arrival_at: string | null;
  departure_at: string | null;
  lock_code: string | null;
  lock_code_visible_after: string;
  deposit: number | null;
  check_in_guide_url: string;
}

export interface HostexReservation {
  reservation_code: string;
  stay_code: string;
  channel_id: string;
  property_id: number;
  channel_type: string; // airbnb, booking.com, booking_site, agoda
  listing_id: string;
  check_in_date: string;
  check_out_date: string;
  number_of_guests: number;
  number_of_adults: number;
  number_of_children: number;
  number_of_infants: number;
  number_of_pets: number;
  status: string; // wait_accept, wait_pay, accepted, cancelled, denied, timeout
  stay_status: string; // checkin_pending, stay_completed, etc.
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  cancelled_at: string | null;
  booked_at: string;
  created_at: string;
  creator: string;
  rates: HostexRates;
  check_in_details: HostexCheckInDetails;
  remarks: string;
  channel_remarks: string;
  conversation_id: string;
  tags: string[];
  custom_channel: { id: number; name: string } | null;
  guests: HostexGuest[];
  custom_fields: Record<string, any> | null;
  in_reservation_box: boolean;
}

export interface HostexPropertyChannel {
  channel_type: string;
  listing_id: string;
  currency: string;
}

export interface HostexProperty {
  id: number;
  title: string;
  channels: HostexPropertyChannel[];
  default_checkin_time: string;
  default_checkout_time: string;
  timezone: string;
  cover?: { original_url: string };
}

interface HostexApiResponse<T> {
  request_id: string;
  error_code: number;
  error_msg: string;
  data: T;
}

// ─── Rate limiter (10 req/sec) ────────────────────────────
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 110; // ~9 req/sec to be safe

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ─── Core HTTP client ─────────────────────────────────────
function hostexRequest<T>(method: string, path: string, body?: any): Promise<HostexApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: HOSTEX_BASE,
      path: `${HOSTEX_API_VERSION}${path}`,
      method,
      headers: {
        'Hostex-Access-Token': HOSTEX_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          reject(new Error(`Hostex API: invalid JSON response (status ${res.statusCode}): ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Hostex API: request timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Public API methods ───────────────────────────────────

/** Get all properties */
export async function getProperties(): Promise<HostexProperty[]> {
  await rateLimitWait();
  const res = await hostexRequest<{ properties: HostexProperty[] }>('GET', '/properties');
  return res.data?.properties || [];
}

/** Get reservations with optional filters */
export async function getReservations(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  check_in_date_start?: string;
  check_in_date_end?: string;
  check_out_date_start?: string;
  check_out_date_end?: string;
  property_id?: number;
  reservation_code?: string; // ← fetch a single reservation by its code (bypasses 20-record cap!)
}): Promise<{ reservations: HostexReservation[]; total: number; page: number; per_page: number }> {
  await rateLimitWait();
  const query = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }
  }
  const path = `/reservations${query.toString() ? '?' + query.toString() : ''}`;
  const res = await hostexRequest<{ reservations: HostexReservation[]; total?: number; current_page?: number; per_page?: number }>('GET', path);
  return {
    reservations: res.data?.reservations || [],
    total: res.data?.total || 0,
    page: res.data?.current_page || 1,
    per_page: res.data?.per_page || 20,
  };
}

/**
 * Get all reservations by fetching per property_id WITH PAGINATION.
 *
 * Hostex API has a hard limit of ~20 records per response.
 * We fetch per property AND paginate through all pages to get everything.
 * Deduplicates by reservation_code.
 */
export async function getAllReservations(): Promise<HostexReservation[]> {
  const all = new Map<string, HostexReservation>();

  // Cutoff: skip very old reservations (checked out >90 days ago)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // All known Hostex property IDs (from /properties endpoint)
  let propertyIds: number[] = [];
  try {
    await rateLimitWait();
    const props = await getProperties();
    propertyIds = props.map(p => p.id);
    console.log(`[Hostex] Found ${propertyIds.length} properties: ${propertyIds.join(', ')}`);
  } catch (e: any) {
    console.error('[Hostex] Failed to fetch properties:', e.message);
    propertyIds = [12446083, 12558043, 12590381, 12590382, 12446084, 12565124];
  }

  for (const propertyId of propertyIds) {
    let page = 1;
    let totalAdded = 0;
    const MAX_PAGES = 10; // Safety limit

    while (page <= MAX_PAGES) {
      await rateLimitWait();
      const result = await getReservations({ property_id: propertyId, per_page: 50, page });
      
      let pageAdded = 0;
      for (const r of result.reservations) {
        if (r.check_out_date < cutoffStr) continue;
        all.set(r.reservation_code, r);
        pageAdded++;
      }
      totalAdded += pageAdded;

      // If we got fewer than 20 records, we've reached the last page
      if (result.reservations.length < 20) {
        console.log(`[Hostex] Property ${propertyId}: ${totalAdded} total (${page} page${page > 1 ? 's' : ''})`);
        break;
      }

      page++;
    }
  }

  const reservations = Array.from(all.values());
  console.log(`[Hostex] Total unique reservations: ${reservations.length}`);
  return reservations;
}


/**
 * Get single reservation by stay_code (only works for hostex_direct reservations).
 * For Airbnb/Booking.com reservations, use getReservationByCode() instead.
 */
export async function getReservation(stayCode: string): Promise<HostexReservation | null> {
  await rateLimitWait();
  const res = await hostexRequest<HostexReservation>('GET', `/reservations/${stayCode}`);
  return res.data || null;
}

/**
 * Fetch a specific reservation by reservation_code using the ?reservation_code= filter.
 * This BYPASSES the 20-record API cap and works for all channel types (Airbnb, Booking.com, etc.)
 * Use this when you have a specific reservation_code from a webhook payload.
 */
export async function getReservationByCode(reservationCode: string): Promise<HostexReservation | null> {
  await rateLimitWait();
  const result = await getReservations({ reservation_code: reservationCode });
  return result.reservations[0] || null;
}

/** Create reservation in Hostex (for push sync) */
export async function createReservation(data: {
  property_id: number;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  number_of_adults?: number;
  number_of_children?: number;
  remarks?: string;
}): Promise<HostexReservation | null> {
  await rateLimitWait();
  const res = await hostexRequest<HostexReservation>('POST', '/reservations', data);
  return res.data || null;
}

/**
 * Update reservation remarks in Hostex
 * Used to push guest page URL back into the reservation notes
 */
export async function updateReservationRemarks(stayCode: string, remarks: string): Promise<boolean> {
  await rateLimitWait();
  try {
    const res = await hostexRequest<any>('PUT', `/reservations/${stayCode}`, { remarks });
    return res.error_code === 0;
  } catch (e) {
    console.error(`[Hostex] Failed to update remarks for ${stayCode}:`, e);
    return false;
  }
}

/**
 * Write a custom field to a Hostex reservation.
 * Custom fields can be referenced in Hostex automated message templates as {{cf.field_name}}.
 *
 * Example: set guest_page_url → use {{cf.guest_page_url}} in Hostex message templates.
 *
 * API docs: https://hostex-openapi.readme.io/reference/custom-fields-guide
 */
export async function updateReservationCustomField(
  stayCode: string,
  fields: Record<string, string>
): Promise<boolean> {
  await rateLimitWait();
  try {
    const res = await hostexRequest<any>('PATCH', `/reservations/${stayCode}/custom_fields`, {
      custom_fields: fields,
    });
    const ok = res.error_code === 200 || res.error_code === 0;
    if (ok) {
      console.log(`[Hostex] Custom fields set for ${stayCode}:`, Object.keys(fields).join(', '));
    } else {
      console.warn(`[Hostex] Custom field error for ${stayCode}:`, res.error_msg);
    }
    return ok;
  } catch (e: any) {
    console.error(`[Hostex] Failed to set custom fields for ${stayCode}:`, e.message);
    return false;
  }
}

// ─── Webhook management ───────────────────────────────────

export interface HostexWebhookConfig {
  id: number;
  url: string;
  events: string[];
  secret_token: string;
  status: string;
}

/** List all registered webhooks */
export async function listWebhooks(): Promise<HostexWebhookConfig[]> {
  await rateLimitWait();
  const res = await hostexRequest<{ webhooks: HostexWebhookConfig[] }>('GET', '/webhooks');
  return res.data?.webhooks || [];
}

/** Register a new webhook */
export async function createWebhook(url: string, events: string[], secretToken?: string): Promise<HostexWebhookConfig | null> {
  await rateLimitWait();
  const body: any = { url, events };
  if (secretToken) body.secret_token = secretToken;
  const res = await hostexRequest<HostexWebhookConfig>('POST', '/webhooks', body);
  if (res.error_code !== 0 && res.error_code !== 200) {
    console.error(`[Hostex] Webhook registration failed:`, res.error_msg);
    return null;
  }
  return res.data || null;
}

/** Delete a webhook by ID */
export async function deleteWebhook(webhookId: number): Promise<boolean> {
  await rateLimitWait();
  try {
    const res = await hostexRequest<any>('DELETE', `/webhooks/${webhookId}`);
    return res.error_code === 0 || res.error_code === 200;
  } catch (e: any) {
    console.error(`[Hostex] Failed to delete webhook ${webhookId}:`, e.message);
    return false;
  }
}

/**
 * Ensure our webhook is registered with Hostex.
 * If not registered, creates it. If already registered, verifies it.
 */
export async function ensureWebhookRegistered(baseUrl: string): Promise<void> {
  const webhookUrl = `${baseUrl}/api/webhooks/hostex`;
  const events = ['reservation_created', 'reservation_updated', 'reservation_cancelled'];

  try {
    const existing = await listWebhooks();
    const ours = existing.find(w => w.url === webhookUrl);
    
    if (ours) {
      console.log(`[Hostex] Webhook already registered: ${webhookUrl} (id=${ours.id}, events=${ours.events.join(',')})`);
      return;
    }

    console.log(`[Hostex] Registering webhook: ${webhookUrl}`);
    const created = await createWebhook(webhookUrl, events);
    if (created) {
      console.log(`[Hostex] ✅ Webhook registered: id=${created.id} url=${webhookUrl}`);
    } else {
      console.error(`[Hostex] ❌ Failed to register webhook`);
    }
  } catch (e: any) {
    console.error(`[Hostex] Webhook registration error:`, e.message);
  }
}


// ─── Exchange rate (ČNB mid-rate EUR/CZK) ─────────────────

let cachedRate: { rate: number; fetchedAt: number } | null = null;
const RATE_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getEurCzkRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < RATE_CACHE_MS) {
    return cachedRate.rate;
  }

  try {
    const rate = await fetchCnbRate();
    cachedRate = { rate, fetchedAt: Date.now() };
    return rate;
  } catch (e) {
    console.error('[Hostex] Failed to fetch ČNB rate, using fallback 25.2:', e);
    return cachedRate?.rate || 25.2;
  }
}

function fetchCnbRate(): Promise<number> {
  return new Promise((resolve, reject) => {
    // ČNB daily exchange rates - plain text format
    const req = https.request({
      hostname: 'www.cnb.cz',
      path: '/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt',
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse ČNB format: "EMU|euro|1|EUR|25,140"
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.includes('EUR')) {
            const parts = line.split('|');
            if (parts.length >= 5) {
              const rate = parseFloat(parts[4].replace(',', '.'));
              if (!isNaN(rate) && rate > 0) {
                resolve(rate);
                return;
              }
            }
          }
        }
        reject(new Error('EUR rate not found in ČNB data'));
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('ČNB timeout')); });
    req.end();
  });
}
