/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import type { ResolvedSiteCredentials } from '../domain/types';
import { getEnvStore } from '../api/create-payment-session';

export function resolveSiteCredentials(opts: { slug?: string | null; id?: string | null }): ResolvedSiteCredentials | null {
  let slug = opts.slug || undefined;
  if (slug === 'kv.kemp-carlsbad.cz') slug = 'kemp-carlsbad';
  const id = opts.id || undefined;
  if (!slug && !id) return null;

  const db = getDb();
  const site = slug
    ? (db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE slug = ?').get(slug) as any)
    : (db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE id = ?').get(id!) as any);

  if (!site) return null;

  let payCfg: any = {};
  try {
    payCfg = JSON.parse(site.payment_config || '{}');
  } catch {
    return null;
  }

  const enabled = payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya?.client_id;
  
  if (enabled) {
    return {
      siteId: site.id,
      siteUrl: site.site_url || undefined,
      credentials: {
        client_id: payCfg.teya.client_id,
        client_secret: payCfg.teya.client_secret,
        store_id: payCfg.teya.store_id,
      },
    };
  }

  // Fallback: If no UI config is set, but the site is Kemp Carlsbad, use the camping ENV store.
  // Slug is stored as the slugified full URL (e.g. "https-kv-kemp-carlsbad-cz"), so match loosely.
  const siteSlug = (site.slug || '') as string;
  const isKempCarlsbad =
    site.id === '2975fba30e3cd3a6f7df3092183e258a' ||
    site.id === '50aeb822f406ff264ac5c292d0d48926' ||
    siteSlug === 'kemp-carlsbad' ||
    siteSlug.includes('kemp-carlsbad');
  if (isKempCarlsbad) {
    const campingCreds = getEnvStore('camping');
    if (campingCreds && campingCreds.client_id) {
      return {
        siteId: site.id,
        siteUrl: site.site_url || undefined,
        credentials: campingCreds,
      };
    }
  }

  return null;
}

export function isGlobalTeyaConfigured(): boolean {
  return !!process.env.TEYA_CLIENT_ID;
}
