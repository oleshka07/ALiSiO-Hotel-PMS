/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import * as connectionsRepo from '../data/connections.repo';
import {
  pullNewReservations,
  acknowledgeReservations,
  pullModifications,
  acknowledgeModifications,
  processReservation,
} from '@/lib/channels/booking-com/reservations';
import { publicMessage } from '@core/security/public-error';

export async function pollReservations(): Promise<NextResponse> {
  const results: {
    connectionId: string;
    channel: string;
    newReservations: number;
    modifications: number;
    actions: Array<{ externalId: string; action: string; pmsId: string | null }>;
    errors: string[];
  }[] = [];

  try {
    const connections = connectionsRepo.getActiveReservationConnections();

    for (const conn of connections) {
      const connTypes = JSON.parse(conn.connection_types || '[]');
      if (!connTypes.includes('RESERVATIONS')) continue;

      const connResult = {
        connectionId: conn.id,
        channel: conn.channel,
        newReservations: 0,
        modifications: 0,
        actions: [] as Array<{ externalId: string; action: string; pmsId: string | null }>,
        errors: [] as string[],
      };

      try {
        const newOnes = await pullNewReservations(conn.id);
        connResult.newReservations = newOnes.length;

        const idsToAck: string[] = [];
        for (const res of newOnes) {
          try {
            const result = processReservation(conn.id, res);
            connResult.actions.push({ externalId: res.externalReservationId, action: result.action, pmsId: result.reservationId });
            idsToAck.push(res.externalReservationId);
          } catch (e: any) {
            connResult.errors.push(`Failed to process ${res.externalReservationId}: ${e.message}`);
          }
        }
        if (idsToAck.length > 0) {
          const acked = await acknowledgeReservations(conn.id, idsToAck);
          if (!acked) connResult.errors.push(`Failed to acknowledge ${idsToAck.length} reservation(s)`);
        }

        const mods = await pullModifications(conn.id);
        connResult.modifications = mods.length;

        const modIdsToAck: string[] = [];
        for (const mod of mods) {
          try {
            const result = processReservation(conn.id, mod);
            connResult.actions.push({ externalId: mod.externalReservationId, action: `mod:${result.action}`, pmsId: result.reservationId });
            modIdsToAck.push(mod.externalReservationId);
          } catch (e: any) {
            connResult.errors.push(`Failed to process modification ${mod.externalReservationId}: ${e.message}`);
          }
        }
        if (modIdsToAck.length > 0) await acknowledgeModifications(conn.id, modIdsToAck);

        connectionsRepo.markConnectionSynced(conn.id);
      } catch (e: any) {
        connResult.errors.push(`Connection ${conn.id}: ${e.message}`);
      }

      results.push(connResult);
    }

    return NextResponse.json({
      polled: results.length,
      totalNewReservations: results.reduce((s, r) => s + r.newReservations, 0),
      totalModifications: results.reduce((s, r) => s + r.modifications, 0),
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
