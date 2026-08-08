/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getQueueStats, getFailedJobs, getAllSyncLogs, dequeueJob, markCompleted, markFailed } from '@/lib/channels';
import { pushInventory, pushRates, pushRestrictions, buildARIFromPriceCalendar } from '@/lib/channels/booking-com/ari';
import { publicMessage } from '@core/security/public-error';

const MAX_JOBS_PER_RUN = 10;

export async function getSyncStatus(): Promise<NextResponse> {
  try {
    const stats = getQueueStats();
    const failedJobs = getFailedJobs(10);
    const recentLogs = getAllSyncLogs({ limit: 20 });
    return NextResponse.json({ queue: stats, failedJobs, recentLogs });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function processSyncQueue(): Promise<NextResponse> {
  const results: Array<{ jobId: string; syncType: string; success: boolean; error?: string }> = [];

  try {
    for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
      const job = dequeueJob();
      if (!job) break;

      try {
        const db = getDb();
        const conn = db.prepare('SELECT status FROM channel_connections WHERE id = ?').get(job.connection_id) as any;
        if (!conn || conn.status !== 'connected') {
          markFailed(job.id, 'Connection not active');
          results.push({ jobId: job.id, syncType: job.sync_type, success: false, error: 'Connection not active' });
          continue;
        }

        const unitTypeId = job.unit_type_id;
        if (!unitTypeId) {
          const mappings = db.prepare(
            'SELECT DISTINCT unit_type_id FROM channel_room_mapping WHERE connection_id = ? AND is_active = 1'
          ).all(job.connection_id) as any[];

          let allSuccess = true;
          for (const m of mappings) {
            const result = await processARIJob(job.connection_id, job.sync_type, m.unit_type_id, job.date_from, job.date_to);
            if (!result.success) allSuccess = false;
          }

          if (allSuccess) { markCompleted(job.id); results.push({ jobId: job.id, syncType: job.sync_type, success: true }); }
          else { markFailed(job.id, 'Partial failure — some unit types failed'); results.push({ jobId: job.id, syncType: job.sync_type, success: false, error: 'Partial failure' }); }
        } else {
          const result = await processARIJob(job.connection_id, job.sync_type, unitTypeId, job.date_from, job.date_to);
          if (result.success) markCompleted(job.id); else markFailed(job.id, result.error || 'Unknown error');
          results.push({ jobId: job.id, syncType: job.sync_type, success: result.success, error: result.error });
        }
      } catch (error: any) {
        markFailed(job.id, error.message);
        results.push({ jobId: job.id, syncType: job.sync_type, success: false, error: publicMessage(error) });
      }
    }

    return NextResponse.json({ processed: results.length, results, queueStats: getQueueStats() });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

async function processARIJob(
  connectionId: string, syncType: string, unitTypeId: string, dateFrom: string, dateTo: string,
): Promise<{ success: boolean; error?: string }> {
  const ari = buildARIFromPriceCalendar(connectionId, unitTypeId, dateFrom, dateTo);

  try {
    switch (syncType) {
      case 'inventory': {
        if (ari.inventory.length === 0) return { success: true };
        const result = await pushInventory(connectionId, ari.inventory);
        return result.success ? { success: true } : { success: false, error: result.errors?.[0]?.message };
      }
      case 'rates': {
        if (ari.rates.length === 0) return { success: true };
        const result = await pushRates(connectionId, ari.rates);
        return result.success ? { success: true } : { success: false, error: result.errors?.[0]?.message };
      }
      case 'restrictions': {
        if (ari.restrictions.length === 0) return { success: true };
        const result = await pushRestrictions(connectionId, ari.restrictions);
        return result.success ? { success: true } : { success: false, error: result.errors?.[0]?.message };
      }
      case 'full': {
        const errors: string[] = [];
        if (ari.inventory.length > 0) { const r = await pushInventory(connectionId, ari.inventory); if (!r.success) errors.push(`Inventory: ${r.errors?.[0]?.message}`); }
        if (ari.rates.length > 0) { const r = await pushRates(connectionId, ari.rates); if (!r.success) errors.push(`Rates: ${r.errors?.[0]?.message}`); }
        if (ari.restrictions.length > 0) { const r = await pushRestrictions(connectionId, ari.restrictions); if (!r.success) errors.push(`Restrictions: ${r.errors?.[0]?.message}`); }
        return errors.length > 0 ? { success: false, error: errors.join('; ') } : { success: true };
      }
      default:
        return { success: false, error: `Unknown sync type: ${syncType}` };
    }
  } catch (error: any) {
    return { success: false, error: publicMessage(error) };
  }
}
