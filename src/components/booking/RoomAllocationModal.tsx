'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Building2, GripVertical, Check, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface UnitRow {
  id: string;
  code: string;
  name: string;
  beds: number;
  building_id: string;
  building_name?: string;
  sort_order: number;
  unit_type_id: string;
  unit_type_name?: string;
  cleaning_status?: string;
  is_pool?: number;
}

interface BookingRow {
  id: string;
  unit_id: string;
  check_in: string;
  check_out: string;
  status: string;
  payment_status?: string;
  source: string;
  adults: number;
  children: number;
  first_name: string;
  last_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  total_price?: number;
  currency?: string;
  notes?: string | null;
  internal_notes?: string | null;
  nights?: number;
  unit_type_name?: string;
  unit_code?: string;
}

interface RoomAllocationModalProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  buildingCode?: string;
}

type RoomState = 'free' | 'stay' | 'arrive-today' | 'arrive-tomorrow' | 'arrive-2days' | 'leave-today' | 'leave-tomorrow';

const BUILDING_F_CODE = 'F';
// Physical layout of Building F: F9..F17 line the left side of the
// corridor (top = F17 furthest from the entrance, bottom = F9); F1..F8
// line the right side (top = F1, bottom = F8). Derive the room number
// from the unit code (`F17` → 17) rather than from sort_order — in
// production the sort_order column has drifted from the dev seed and
// most rooms ended up on the wrong side of the corridor. The code is
// the source of truth visible to the user.
const LEFT_WING_MIN_NUM_F = 9;

function roomNumOf(code: string): number {
  const m = (code || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000);
}

function formatShort(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function partyOf(b: BookingRow): number {
  return Math.max(1, (b.adults || 0) + (b.children || 0));
}

function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && aOut > bIn;
}

export default function RoomAllocationModal({ open, onClose, onChanged, buildingCode = BUILDING_F_CODE }: RoomAllocationModalProps) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [activeBuilding, setActiveBuilding] = useState(buildingCode || 'F');
  const [detailBooking, setDetailBooking] = useState<BookingRow | null>(null);

  const todayISO = useMemo(() => toISO(new Date()), []);
  const [viewDate, setViewDate] = useState(todayISO);
  const horizonISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toISO(d);
  }, []);

  // Reset viewDate when modal opens
  useEffect(() => { if (open) setViewDate(toISO(new Date())); }, [open]);

  const viewDateLabel = useMemo(() => {
    if (viewDate === todayISO) return 'Сьогодні';
    if (viewDate === addDays(todayISO, 1)) return 'Завтра';
    if (viewDate === addDays(todayISO, -1)) return 'Вчора';
    return formatShort(viewDate);
  }, [viewDate, todayISO]);

  const viewDateWeekday = useMemo(() => {
    const DAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    return DAYS[new Date(viewDate + 'T00:00:00').getDay()];
  }, [viewDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [uRes, bRes] = await Promise.all([
        // include_pool=1 brings in the virtual staging pool unit; we
        // separate it from real rooms client-side.
        fetch('/api/units?category=resort&include_pool=1'),
        // Room bookings: date-filtered for performance
        fetch(`/api/bookings?category=resort&check_out_from=${todayISO}&date_to=${horizonISO}&limit=500`),
      ]);
      if (!uRes.ok) throw new Error('Не вдалося завантажити юніти');
      if (!bRes.ok) throw new Error('Не вдалося завантажити бронювання');
      const uAll = await uRes.json();
      const bAll = await bRes.json();
      const fUnits = (Array.isArray(uAll) ? uAll : []).filter((u: any) => {
        // Pool unit always included regardless of building — Чорновик is shared
        if (u.is_pool === 1) return true;
        // Use building_code for exact match — substring on building_name
        // matched 'D' in 'Будова' and 'Standart', mixing F rooms into D tab
        const bCode = (u.building_code || '').toUpperCase();
        return bCode === activeBuilding;
      });
      const fUnitIds = new Set(fUnits.map((u: any) => u.id));

      // Find pool unit to fetch its bookings separately (no date filter —
      // pool bookings are drafts that must always be visible).
      const poolU = fUnits.find((u: any) => u.is_pool === 1);
      let poolBookings: any[] = [];
      if (poolU) {
        try {
          // Fetch pool bookings by unit_id — no date filter needed, only a few records
          const pbRes = await fetch(`/api/bookings?unit_id=${poolU.id}`);
          if (pbRes.ok) {
            const pbAll = await pbRes.json();
            const pbList = Array.isArray(pbAll) ? pbAll : (pbAll.bookings || []);
            poolBookings = pbList.filter((b: any) => !['cancelled', 'no_show'].includes(b.status));
          }
        } catch { /* non-fatal */ }
      }

      const list = Array.isArray(bAll) ? bAll : (bAll.bookings || []);
      // Merge: main bookings + pool bookings (deduplicated)
      const mainIds = new Set(list.map((b: any) => b.id));
      const merged = [...list, ...poolBookings.filter((b: any) => !mainIds.has(b.id))];

      const fBookings = merged.filter((b: any) => {
        if (!fUnitIds.has(b.unit_id)) return false;
        // Cancelled / no-show never shown.
        if (['cancelled', 'no_show'].includes(b.status)) return false;
        // Draft bookings ARE shown when on pool units (staging strip),
        // but hidden on real rooms (shouldn't normally happen).
        const isOnPool = fUnits.some((u: any) => u.id === b.unit_id && u.is_pool === 1);
        if (b.status === 'draft' && !isOnPool) return false;
        // Hostex sometimes injects availability blocks as fake reservations
        const fullName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        if (/(ota|channel|hostex)[\s_-]*block/.test(fullName)) return false;
        return true;
      });

      // Debug: log what we found
      console.log(`[RAM] Units: ${fUnits.length} (pool: ${poolU?.id || 'NONE'}), API bookings: ${list.length}, poolFetch: ${poolBookings.length}, merged: ${merged.length}, F-filtered: ${fBookings.length}`);

      setUnits(fUnits as UnitRow[]);
      setBookings(fBookings as BookingRow[]);
    } catch (e: any) {
      setError(e.message || 'Помилка');
    } finally {
      setLoading(false);
    }
  }, [todayISO, horizonISO, activeBuilding]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // Virtual staging pool unit for this building. Bookings on this unit
  // are "in Чорновик" — they have no real room and live in the staging
  // strip. The room-allocation modal is the only surface that knows
  // about pool units; every other module's API requests omit them via
  // the default include_pool=false on /api/units.
  const poolUnit = useMemo(() => units.find(u => u.is_pool === 1) || null, [units]);
  const poolUnitId = poolUnit?.id || null;

  // Real rooms only — pool unit is rendered separately as the Чорновик
  // strip and should never appear in the floor plan grid.
  const roomUnits = useMemo(() => units.filter(u => u.id !== poolUnitId), [units, poolUnitId]);

  // ── Index: which booking lives in a given REAL room on viewDate
  // Only shows bookings where check_in <= viewDate < check_out
  const bookingByUnit = useMemo(() => {
    const m = new Map<string, BookingRow>();
    for (const b of bookings) {
      if (b.unit_id === poolUnitId) continue;
      if (b.check_in <= viewDate && b.check_out > viewDate) {
        m.set(b.unit_id, b);
      }
    }
    return m;
  }, [bookings, viewDate, poolUnitId]);

  // ── Upcoming arrivals: bookings arriving in the next 1-2 days after viewDate
  // Shown as small tags on free rooms
  const upcomingByUnit = useMemo(() => {
    const m = new Map<string, BookingRow>();
    const d1 = addDays(viewDate, 1);
    const d2 = addDays(viewDate, 2);
    for (const b of bookings) {
      if (b.unit_id === poolUnitId) continue;
      // Skip if this booking is already the current occupant
      if (b.check_in <= viewDate && b.check_out > viewDate) continue;
      if (b.check_in === viewDate || b.check_in === d1 || b.check_in === d2) {
        const existing = m.get(b.unit_id);
        if (!existing || b.check_in < existing.check_in) m.set(b.unit_id, b);
      }
    }
    return m;
  }, [bookings, viewDate, poolUnitId]);

  const stateOf = useCallback((b: BookingRow): RoomState => {
    if (b.check_in === viewDate) return 'arrive-today';
    if (b.check_in === addDays(viewDate, 1)) return 'arrive-tomorrow';
    if (b.check_in === addDays(viewDate, 2)) return 'arrive-2days';
    if (b.check_out === viewDate) return 'leave-today';
    if (b.check_out === addDays(viewDate, 1)) return 'leave-tomorrow';
    return 'stay';
  }, [viewDate]);

  // Wings — derived from real rooms only.
  const leftWing = useMemo(() => {
    return roomUnits
      .filter(u => roomNumOf(u.code) >= LEFT_WING_MIN_NUM_F)
      .sort((a, b) => roomNumOf(b.code) - roomNumOf(a.code));
  }, [roomUnits]);
  const rightWing = useMemo(() => {
    return roomUnits
      .filter(u => {
        const n = roomNumOf(u.code);
        return n > 0 && n < LEFT_WING_MIN_NUM_F;
      })
      .sort((a, b) => roomNumOf(a.code) - roomNumOf(b.code));
  }, [roomUnits]);

  // Status bar — relative to viewDate
  const occupied = bookingByUnit.size;
  const arrivalsOnDate = bookings.filter(b => b.check_in === viewDate && b.unit_id !== poolUnitId).length;
  const departuresOnDate = bookings.filter(b => b.check_out === viewDate && b.unit_id !== poolUnitId).length;

  // Чорновик: bookings parked on the pool unit. Admin moved them here
  // from a real room (or they came in via a future "pending assignment"
  // flow). Dragging them onto a real room calls PATCH unit_id := real.
  const stagingBookings = useMemo(() => {
    if (!poolUnitId) return [];
    return bookings.filter(b => b.unit_id === poolUnitId);
  }, [bookings, poolUnitId]);

  // ── Validation
  const canAccept = useCallback((destUnitId: string, bookingId: string): { ok: boolean; type?: 'move' | 'swap'; reason?: string } => {
    const guest = bookings.find(b => b.id === bookingId);
    if (!guest) return { ok: false, reason: 'Бронювання не знайдено' };
    if (guest.unit_id === destUnitId) return { ok: false };
    // Drop on the staging pool is always a valid move — no capacity,
    // no overlap, multiple bookings can sit in the pool simultaneously.
    if (destUnitId === poolUnitId) return { ok: true, type: 'move' };
    const room = units.find(u => u.id === destUnitId);
    if (!room) return { ok: false, reason: 'Кімната не знайдена' };
    const party = partyOf(guest);
    if (room.beds < party) return { ok: false, reason: `${room.code}: ${room.beds} місць, треба ${party}` };

    const occupant = bookingByUnit.get(destUnitId);
    if (!occupant) {
      const conflict = bookings.find(b =>
        b.id !== guest.id &&
        b.unit_id === destUnitId &&
        rangesOverlap(guest.check_in, guest.check_out, b.check_in, b.check_out),
      );
      if (conflict) {
        return { ok: false, reason: `${room.code}: зайнято ${formatShort(conflict.check_in)}–${formatShort(conflict.check_out)} (${conflict.first_name} ${conflict.last_name})` };
      }
      return { ok: true, type: 'move' };
    }
    if (occupant.id === guest.id) return { ok: false };

    // Swap proposed: both bookings need to fit the other room AND not collide with other bookings there
    const fromRoom = units.find(u => u.id === guest.unit_id);
    if (!fromRoom) return { ok: false };
    if (fromRoom.beds < partyOf(occupant)) return { ok: false, reason: `Обмін: ${occupant.first_name} не вміщується у ${fromRoom.code}` };
    const otherInDest = bookings.find(b =>
      b.id !== guest.id && b.id !== occupant.id &&
      b.unit_id === destUnitId &&
      rangesOverlap(guest.check_in, guest.check_out, b.check_in, b.check_out),
    );
    if (otherInDest) return { ok: false, reason: `${room.code}: інше бронювання на ці дати` };
    const otherInOrigin = bookings.find(b =>
      b.id !== guest.id && b.id !== occupant.id &&
      b.unit_id === guest.unit_id &&
      rangesOverlap(occupant.check_in, occupant.check_out, b.check_in, b.check_out),
    );
    if (otherInOrigin) return { ok: false, reason: `${fromRoom.code}: інше бронювання на ці дати` };
    return { ok: true, type: 'swap' };
  }, [bookings, units, bookingByUnit, poolUnitId]);

  const showToast = (text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 2400);
  };

  const handleDeleteDraft = useCallback(async (bookingId: string) => {
    // Safety: only allow deleting draft/pool bookings
    const bk = bookings.find(b => b.id === bookingId);
    if (bk && bk.status !== 'draft' && bk.unit_id !== poolUnitId) {
      showToast('Можна видалити тільки чорновикові бронювання', 'err');
      return;
    }
    try {
      const resp = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || 'Не вдалося видалити');
      }
      showToast('Бронювання видалено');
      setDetailBooking(null);
      await fetchData();
      onChanged?.();
    } catch (e: any) {
      showToast(e.message || 'Помилка видалення', 'err');
    }
  }, [fetchData, onChanged, bookings, poolUnitId]);

  const attemptMove = useCallback(async (bookingId: string, destUnitId: string) => {
    const guest = bookings.find(b => b.id === bookingId);
    if (!guest) return;
    const res = canAccept(destUnitId, bookingId);
    if (!res.ok) { if (res.reason) showToast(res.reason, 'err'); return; }

    if (res.type === 'move') {
      // When a draft leaves the pool → promote to confirmed
      const isDraft = guest.status === 'draft';
      const destIsReal = destUnitId !== poolUnitId;
      const patchBody: Record<string, string> = { unit_id: destUnitId };
      if (isDraft && destIsReal) patchBody.status = 'confirmed';

      // Optimistic update
      const next = bookings.map(b => b.id === bookingId
        ? { ...b, unit_id: destUnitId, status: (isDraft && destIsReal) ? 'confirmed' : b.status }
        : b
      );
      setBookings(next);
      try {
        const resp = await fetch(`/api/bookings/${bookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.error || 'Не вдалося перенести');
        }
        const room = units.find(u => u.id === destUnitId);
        showToast(`${guest.first_name} → ${room?.code || ''}${isDraft && destIsReal ? ' ✓' : ''}`);
        onChanged?.();
      } catch (e: any) {
        showToast(e.message || 'Помилка', 'err');
        await fetchData();
      }
    } else {
      // Swap: 2 PATCHes (origin → temp impossible without nullable; use sequential with API guards)
      const occupant = bookingByUnit.get(destUnitId);
      if (!occupant) return;
      const originUnit = guest.unit_id;
      // Move occupant to origin first, then guest to dest. If first PATCH fails — abort.
      // If first succeeds but second fails — try to revert occupant.
      try {
        // 1) Move occupant out of dest into a placeholder? We can't (NOT NULL on unit_id).
        // Strategy: temporarily set occupant.check_in/out aside? No — too risky.
        // Better: move guest first into dest only if we can free dest first. Since we can't,
        // use the PATCH overlap guard which would block us anyway. We instead bypass by
        // updating occupant first to origin, accepting a brief moment of overlap-in-origin
        // (guest still there) — but the PATCH overlap guard will reject that.
        //
        // Cleanest path: two-phase swap via a "no-op temp" technique is not supported.
        // For V1 we surface a clear error and ask user to free dest manually.
        throw new Error('Обмін поки не підтримується: спершу звільни кімнату вручну');
      } catch (e: any) {
        showToast(e.message || 'Обмін недоступний', 'err');
      }
      void originUnit; void occupant;
    }
  }, [bookings, units, bookingByUnit, canAccept, onChanged, fetchData]);

  // ── Drag-and-drop / tap state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const candRef = useRef<{ id: string; el: HTMLElement; x: number; y: number; pointerType: string } | null>(null);
  const dragActiveRef = useRef(false);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const lpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastZoneRef = useRef<HTMLElement | null>(null);
  const floorRef = useRef<HTMLDivElement | null>(null);
  const scrollRAFRef = useRef<number | null>(null);
  const scrollDirRef = useRef(0);

  const cleanupDrag = () => {
    dragActiveRef.current = false;
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
    if (lastZoneRef.current) {
      lastZoneRef.current.classList.remove('ram-drop-hover');
      lastZoneRef.current = null;
    }
    if (scrollRAFRef.current) {
      cancelAnimationFrame(scrollRAFRef.current);
      scrollRAFRef.current = null;
    }
    scrollDirRef.current = 0;
    document.querySelectorAll<HTMLElement>('[data-ram-card].ram-dragging').forEach(el => el.classList.remove('ram-dragging'));
    document.querySelectorAll<HTMLElement>('[data-ram-dropzone]').forEach(el => {
      el.classList.remove('ram-valid', 'ram-swap', 'ram-drop-hover');
    });
  };

  const detachListeners = () => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
  };

  const applyValidHighlights = (bookingId: string) => {
    document.querySelectorAll<HTMLElement>('[data-ram-dropzone]').forEach(z => {
      const id = z.dataset.ramDropzone || '';
      const r = canAccept(id, bookingId);
      z.classList.remove('ram-valid', 'ram-swap');
      if (r.ok) z.classList.add(r.type === 'swap' ? 'ram-swap' : 'ram-valid');
    });
  };

  const activateDrag = (x: number, y: number) => {
    const c = candRef.current;
    if (!c) return;
    dragActiveRef.current = true;
    setSelectedId(null);
    const rect = c.el.getBoundingClientRect();
    const ghost = c.el.cloneNode(true) as HTMLDivElement;
    ghost.classList.add('ram-ghost');
    ghost.classList.remove('ram-dragging', 'ram-selected');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = (x - (x - rect.left)) + 'px';
    ghost.style.top = (y - (y - rect.top)) + 'px';
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    c.el.classList.add('ram-dragging');
    moveGhost(x, y, rect);
    applyValidHighlights(c.id);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
  };

  const moveGhost = (x: number, y: number, rect?: DOMRect) => {
    if (!ghostRef.current) return;
    const c = candRef.current!;
    const r = rect || c.el.getBoundingClientRect();
    const ox = c.x - r.left;
    const oy = c.y - r.top;
    ghostRef.current.style.left = `${x - ox}px`;
    ghostRef.current.style.top = `${y - oy}px`;
  };

  const updateHover = (x: number, y: number) => {
    const elBelow = document.elementFromPoint(x, y) as HTMLElement | null;
    const zone = elBelow?.closest('[data-ram-dropzone]') as HTMLElement | null;
    if (zone === lastZoneRef.current) return;
    if (lastZoneRef.current) lastZoneRef.current.classList.remove('ram-drop-hover');
    lastZoneRef.current = zone;
    if (zone) zone.classList.add('ram-drop-hover');
  };

  const doEdgeScroll = () => {
    if (scrollDirRef.current && floorRef.current) {
      floorRef.current.scrollTop += scrollDirRef.current * 8;
      scrollRAFRef.current = requestAnimationFrame(doEdgeScroll);
    } else {
      scrollRAFRef.current = null;
    }
  };
  const edgeScroll = (y: number) => {
    if (!floorRef.current) return;
    const fr = floorRef.current.getBoundingClientRect();
    const HOT = 56;
    if (y < fr.top + HOT) scrollDirRef.current = -1;
    else if (y > fr.bottom - HOT) scrollDirRef.current = 1;
    else scrollDirRef.current = 0;
    if (scrollDirRef.current && !scrollRAFRef.current) {
      scrollRAFRef.current = requestAnimationFrame(doEdgeScroll);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button != null && e.button !== 0) return;
    const target = e.target as HTMLElement;
    const card = target.closest('[data-ram-card]') as HTMLElement | null;
    if (!card) return;
    const id = card.dataset.ramCard;
    if (!id) return;
    candRef.current = { id, el: card, x: e.clientX, y: e.clientY, pointerType: e.pointerType };
    if (e.pointerType === 'touch') {
      lpTimerRef.current = setTimeout(() => activateDrag(e.clientX, e.clientY), 220);
    }
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  };

  const onPointerMove = (e: PointerEvent) => {
    const c = candRef.current;
    if (!c) return;
    const dx = e.clientX - c.x;
    const dy = e.clientY - c.y;
    const dist = Math.hypot(dx, dy);
    if (!dragActiveRef.current) {
      if (c.pointerType === 'mouse') {
        if (dist > 5) activateDrag(c.x, c.y);
      } else {
        if (dist > 12) {
          if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
          detachListeners();
          candRef.current = null;
        }
      }
      if (!dragActiveRef.current) return;
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    updateHover(e.clientX, e.clientY);
    edgeScroll(e.clientY);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
    const wasDrag = dragActiveRef.current;
    const c = candRef.current;
    if (wasDrag && c) {
      const elBelow = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const zone = elBelow?.closest('[data-ram-dropzone]') as HTMLElement | null;
      const dest = zone?.dataset.ramDropzone || '';
      cleanupDrag();
      if (dest) attemptMove(c.id, dest);
    } else if (c) {
      // tap
      if (selectedId === c.id) {
        setSelectedId(null);
        document.querySelectorAll<HTMLElement>('[data-ram-dropzone]').forEach(z => z.classList.remove('ram-valid', 'ram-swap'));
      } else {
        setSelectedId(c.id);
        applyValidHighlights(c.id);
      }
    }
    detachListeners();
    candRef.current = null;
  };

  const onPointerCancel = () => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
    if (dragActiveRef.current) cleanupDrag();
    detachListeners();
    candRef.current = null;
  };

  // Tap on a room while a guest is selected → move
  const handleZoneClick = (destUnitId: string) => {
    if (!selectedId) return;
    const id = selectedId;
    setSelectedId(null);
    document.querySelectorAll<HTMLElement>('[data-ram-dropzone]').forEach(z => z.classList.remove('ram-valid', 'ram-swap'));
    attemptMove(id, destUnitId);
  };

  const clearSelection = () => {
    setSelectedId(null);
    document.querySelectorAll<HTMLElement>('[data-ram-dropzone]').forEach(z => z.classList.remove('ram-valid', 'ram-swap'));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearSelection(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Lock the underlying page scroll while the modal is open. iOS Safari
  // happily rubber-bands the document under a fixed sheet otherwise,
  // which made the calendar grid behind the modal scroll on touch.
  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    const blockOutsideTouch = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('.ram-sheet')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockOutsideTouch, { passive: false });
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.touchAction = prevBodyTouch;
      document.removeEventListener('touchmove', blockOutsideTouch);
    };
  }, [open]);

  // Re-apply highlight when bookings change while a guest is selected
  useEffect(() => {
    if (selectedId) applyValidHighlights(selectedId);
  }, [bookings, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useBodyScrollLock(open);

  if (!open) return null;

  const selectedGuest = selectedId ? bookings.find(b => b.id === selectedId) : null;
  const fmt = (d: string) => formatShort(d);

  return (
    <>
      <RoomAllocationStyles />
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet ram-sheet" style={{ maxHeight: '94dvh' }}>
        <div className="ram-head">
          <div className="ram-ico">
            <Building2 size={17} strokeWidth={1.9} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ram-title">Будова {activeBuilding} · Розселення</div>
            <div className="ram-subtitle">{roomUnits.length} кімнат</div>
          </div>
          <button className="ram-close" onClick={onClose} aria-label="Закрити">
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* ── Building switcher tabs ── */}
        <div className="ram-tabs">
          {['F', 'D'].map(code => (
            <button
              key={code}
              className={`ram-tab ${activeBuilding === code ? 'ram-tab-active' : ''}`}
              onClick={() => { setActiveBuilding(code); setDetailBooking(null); setSelectedId(null); }}
            >
              Будова {code}
            </button>
          ))}
        </div>

        {/* ── Date picker ── */}
        <div className="ram-datepicker">
          <button className="ram-dp-btn" onClick={() => setViewDate(d => addDays(d, -1))}>
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>
          <button
            className={`ram-dp-date ${viewDate === todayISO ? 'ram-dp-today' : ''}`}
            onClick={() => setViewDate(todayISO)}
            title="Повернутись на сьогодні"
          >
            <span className="ram-dp-label">{viewDateLabel}</span>
            <span className="ram-dp-weekday">{viewDateWeekday}</span>
          </button>
          <button className="ram-dp-btn" onClick={() => setViewDate(d => addDays(d, 1))}>
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="ram-statusbar">
          <div className="ram-sb-item"><span className="ram-sb-k">Зайнято</span><span className="ram-sb-v ram-c-occ">{occupied}/{roomUnits.length}</span></div>
          <div className="ram-sb-item"><span className="ram-sb-k">Вільно</span><span className="ram-sb-v ram-c-free">{Math.max(0, roomUnits.length - occupied)}</span></div>
          <div className="ram-sb-item"><span className="ram-sb-k">Заїзди</span><span className="ram-sb-v ram-c-arr">{arrivalsOnDate}</span></div>
          <div className="ram-sb-item"><span className="ram-sb-k">Виїзди</span><span className="ram-sb-v ram-c-lea">{departuresOnDate}</span></div>
        </div>

        {/* Чорновик is always visible and is a drop target so admins can
            park bookings without a room. Hidden only when the building
            has no pool unit configured yet. */}
        {poolUnitId && (
          <div className="ram-staging" data-ram-dropzone={poolUnitId} onClick={() => handleZoneClick(poolUnitId)}>
            <div className="ram-staging-head">
              <span className="ram-staging-lbl">Чорновик</span>
              <span className="ram-staging-cnt">{stagingBookings.length}</span>
              <span className="ram-staging-tip">{stagingBookings.length > 0 ? 'тягни в кімнату ↓' : 'тягни сюди гостя без кімнати'}</span>
            </div>
            {stagingBookings.length > 0 ? (
              <div className="ram-staging-scroll" onPointerDown={onPointerDown}>
                {stagingBookings.map(b => (
                  <StagingChip key={b.id} booking={b} stateOf={stateOf} formatShort={fmt} onInfo={setDetailBooking} />
                ))}
              </div>
            ) : (
              <div className="ram-staging-empty">Усі гості розподілені ✓</div>
            )}
          </div>
        )}

        <div className="ram-legend">
          <div className="ram-lg"><span className="ram-sw ram-sw-free" /> Вільна</div>
          <div className="ram-lg"><span className="ram-sw ram-sw-stay" /> Проживає</div>
          <div className="ram-lg"><span className="ram-sw ram-sw-arr" /> Заїзд</div>
          <div className="ram-lg"><span className="ram-sw ram-sw-lea" /> Виїзд</div>
        </div>

        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Завантаження…
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: 12, margin: 10, borderRadius: 8, background: 'rgba(242,107,107,0.12)', color: '#F26B6B', fontSize: 13, fontWeight: 600 }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <div className="ram-floor" ref={floorRef} onPointerDown={onPointerDown}>
            <div className="ram-wing">
              <div className="ram-wing-label">Ліве крило</div>
              <div className="ram-wing-list">
                {leftWing.map(u => (
                  <RoomCard key={u.id} unit={u} guest={bookingByUnit.get(u.id) || null} upcoming={upcomingByUnit.get(u.id) || null} stateOf={stateOf} onTapEmpty={handleZoneClick} formatShort={fmt} viewDate={viewDate} />
                ))}
                {leftWing.length === 0 && <div className="ram-empty">—</div>}
              </div>
            </div>
            <div className="ram-corridor" />
            <div className="ram-wing">
              <div className="ram-wing-label">Праве крило</div>
              <div className="ram-wing-list">
                {rightWing.map(u => (
                  <RoomCard key={u.id} unit={u} guest={bookingByUnit.get(u.id) || null} upcoming={upcomingByUnit.get(u.id) || null} stateOf={stateOf} onTapEmpty={handleZoneClick} formatShort={fmt} viewDate={viewDate} />
                ))}
                {rightWing.length === 0 && <div className="ram-empty">—</div>}
              </div>
            </div>
          </div>
        )}

        {selectedGuest && (
          <div className="ram-selbar">
            <Check size={14} strokeWidth={2.2} />
            <span>{selectedGuest.first_name} {selectedGuest.last_name} · обери кімнату</span>
            <button className="ram-cancel-sel" onClick={clearSelection}>Скасувати</button>
          </div>
        )}

        {toast && (
          <div className={`ram-toast ram-toast-${toast.kind}`}>
            <span className="ram-toast-dot" />
            <span>{toast.text}</span>
          </div>
        )}
      </div>
      {detailBooking && (
        <StagingDetailPanel
          booking={detailBooking}
          onClose={() => setDetailBooking(null)}
          onDelete={handleDeleteDraft}
          fmt={fmt}
        />
      )}
    </>
  );
}

function RoomCard({ unit, guest, upcoming, stateOf, onTapEmpty, formatShort: fmt, viewDate }: {
  unit: UnitRow;
  guest: BookingRow | null;
  upcoming: BookingRow | null;
  stateOf: (b: BookingRow) => RoomState;
  onTapEmpty: (unitId: string) => void;
  formatShort: (d: string) => string;
  viewDate: string;
}) {
  if (!guest) {
    // Show upcoming arrival tag on free rooms
    const upTag = upcoming ? (
      upcoming.check_in === viewDate ? 'заїзд сьогодні'
      : upcoming.check_in === addDays(viewDate, 1) ? `заїзд завтра`
      : `заїзд ${fmt(upcoming.check_in)}`
    ) : null;
    const upTagClass = upcoming?.check_in === viewDate ? 'ram-tag-arr-strong' : 'ram-tag-arr';
    return (
      <div
        className="ram-room ram-room-free"
        data-ram-dropzone={unit.id}
        onClick={() => onTapEmpty(unit.id)}
      >
        <div className="ram-room-top">
          <span className="ram-room-no">№{unit.code}</span>
          <span className="ram-dot ram-dot-free" />
          <span className="ram-occ ram-occ-empty">
            <span className="ram-occ-cap">0/{unit.beds}</span>
          </span>
        </div>
        <div className="ram-room-meta" style={{ marginTop: 2 }}>
          <span className="ram-room-free-text">вільна</span>
          {upTag && <span className={`ram-tag ${upTagClass}`}>{upTag}</span>}
          {upcoming && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{upcoming.first_name}</span>}
        </div>
      </div>
    );
  }
  const st = stateOf(guest);
  const stClass = st.startsWith('arrive') ? 'ram-room-arr' : st.startsWith('leave') ? 'ram-room-lea' : 'ram-room-stay';
  const dotClass = st.startsWith('arrive') ? 'ram-dot-arr' : st.startsWith('leave') ? 'ram-dot-lea' : 'ram-dot-stay';
  const party = partyOf(guest);
  const tag = st === 'arrive-today' ? 'заїзд сьогодні'
    : st === 'arrive-tomorrow' ? 'заїзд завтра'
    : st === 'arrive-2days' ? 'заїзд +2дн'
    : st === 'leave-today' ? 'виїзд сьогодні'
    : st === 'leave-tomorrow' ? 'виїзд завтра' : '';
  const tagClass = st === 'arrive-today' ? 'ram-tag-arr-strong'
    : st === 'leave-today' ? 'ram-tag-lea-strong'
    : st.startsWith('arrive') ? 'ram-tag-arr'
    : st.startsWith('leave') ? 'ram-tag-lea' : '';
  return (
    <div
      className={`ram-room ${stClass}`}
      data-ram-card={guest.id}
      data-ram-dropzone={unit.id}
    >
      <div className="ram-room-top">
        <GripVertical size={11} className="ram-grip" />
        <span className="ram-room-no">№{unit.code}</span>
        <span className={`ram-dot ${dotClass}`} />
        <span className={`ram-occ ${party >= unit.beds ? 'ram-occ-full' : ''}`}>
          <span className="ram-occ-cap">{party}/{unit.beds}</span>
        </span>
      </div>
      <div className="ram-room-guest">
        <div className="ram-room-name">{guest.first_name} {guest.last_name}</div>
        <div className="ram-room-meta">
          <span className="ram-room-dates">{fmt(guest.check_in)}–{fmt(guest.check_out)}</span>
          {tag && <span className={`ram-tag ${tagClass}`}>{tag}</span>}
        </div>
      </div>
    </div>
  );
}

function StagingChip({ booking, stateOf, formatShort: fmt, onInfo }: {
  booking: BookingRow;
  stateOf: (b: BookingRow) => RoomState;
  formatShort: (d: string) => string;
  onInfo: (b: BookingRow) => void;
}) {
  const st = stateOf(booking);
  const tag = st === 'arrive-today' ? 'сьогодні'
    : st === 'arrive-tomorrow' ? 'завтра'
    : st === 'arrive-2days' ? '+2 дн'
    : '';
  const tagClass = st === 'arrive-today' ? 'ram-tag-arr-strong' : 'ram-tag-arr';
  const party = partyOf(booking);
  return (
    <div className="ram-chip" data-ram-card={booking.id}>
      <div className="ram-chip-top">
        <GripVertical size={11} className="ram-grip" />
        <span className="ram-chip-name">{booking.first_name} {booking.last_name}</span>
        <span className="ram-chip-pax">{party}</span>
      </div>
      <div className="ram-chip-bottom">
        {tag && <span className={`ram-tag ${tagClass}`}>{tag}</span>}
        <span className="ram-chip-dates">{fmt(booking.check_in)}–{fmt(booking.check_out)}</span>
        {booking.source && <span className="ram-chip-src">{booking.source}</span>}
        <button className="ram-chip-info" onClick={(e) => { e.stopPropagation(); onInfo(booking); }} title="Деталі"><Info size={12} strokeWidth={2} /></button>
      </div>
    </div>
  );
}

function StagingDetailPanel({ booking, onClose, onDelete, fmt }: {
  booking: BookingRow;
  onClose: () => void;
  onDelete: (id: string) => void;
  fmt: (d: string) => string;
}) {
  const [confirming, setConfirming] = useState(false);
  const party = partyOf(booking);
  return (
    <div className="ram-detail-overlay" onClick={onClose}>
      <div className="ram-detail" onClick={e => e.stopPropagation()}>
        <div className="ram-detail-head">
          <span className="ram-detail-name">{booking.first_name} {booking.last_name}</span>
          <button className="ram-close" onClick={onClose} style={{width:26,height:26}}>
            <X size={13} strokeWidth={2} />
          </button>
        </div>
        <div className="ram-detail-grid">
          <div className="ram-detail-row">
            <span className="ram-detail-k">Дати</span>
            <span className="ram-detail-v">{fmt(booking.check_in)} — {fmt(booking.check_out)}{booking.nights ? ` (${booking.nights} ноч.)` : ''}</span>
          </div>
          <div className="ram-detail-row">
            <span className="ram-detail-k">Гості</span>
            <span className="ram-detail-v">{booking.adults || 0} дор.{booking.children ? ` + ${booking.children} діт.` : ''} ({party} ос.)</span>
          </div>
          {booking.unit_type_name && (
            <div className="ram-detail-row">
              <span className="ram-detail-k">Тип</span>
              <span className="ram-detail-v">{booking.unit_type_name}</span>
            </div>
          )}
          {booking.total_price != null && booking.total_price > 0 && (
            <div className="ram-detail-row">
              <span className="ram-detail-k">Ціна</span>
              <span className="ram-detail-v">{booking.total_price} {booking.currency || 'CZK'}</span>
            </div>
          )}
          <div className="ram-detail-row">
            <span className="ram-detail-k">Джерело</span>
            <span className="ram-detail-v">{booking.source || '—'}</span>
          </div>
          <div className="ram-detail-row">
            <span className="ram-detail-k">Статус</span>
            <span className="ram-detail-v">{booking.status}</span>
          </div>
          {booking.guest_email && (
            <div className="ram-detail-row">
              <span className="ram-detail-k">Email</span>
              <span className="ram-detail-v">{booking.guest_email}</span>
            </div>
          )}
          {booking.guest_phone && (
            <div className="ram-detail-row">
              <span className="ram-detail-k">Телефон</span>
              <span className="ram-detail-v">{booking.guest_phone}</span>
            </div>
          )}
          {booking.notes && (
            <div className="ram-detail-row">
              <span className="ram-detail-k">Нотатки</span>
              <span className="ram-detail-v">{booking.notes}</span>
            </div>
          )}
        </div>
        <div className="ram-detail-actions">
          {!confirming ? (
            <button className="ram-detail-del" onClick={() => setConfirming(true)}>🗑 Видалити бронювання</button>
          ) : (
            <div className="ram-detail-confirm">
              <span>Видалити {booking.first_name}?</span>
              <button className="ram-detail-del-yes" onClick={() => onDelete(booking.id)}>Так</button>
              <button className="ram-detail-del-no" onClick={() => setConfirming(false)}>Ні</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function RoomAllocationStyles() {
  return (
    <style>{`
      /* ── Desktop override: centered modal instead of bottom sheet ── */
      @media (min-width: 769px) {
        .m-sheet-backdrop + .ram-sheet,
        .ram-sheet.m-sheet {
          bottom: auto !important;
          left: 50% !important;
          top: 50% !important;
          right: auto !important;
          transform: translate(-50%, -50%) !important;
          width: 540px !important;
          max-width: 94vw !important;
          max-height: 85vh !important;
          border-radius: 16px !important;
          animation: ram-pop-in 0.25s cubic-bezier(0.32, 0.72, 0, 1) !important;
          box-shadow: 0 24px 80px -12px rgba(0,0,0,0.6), 0 0 0 1px var(--border-primary);
          padding-bottom: 0 !important;
        }
        @keyframes ram-pop-in {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        /* Compact rooms for desktop — fit more on screen */
        .ram-room { padding: 5px 7px; }
        .ram-room-no { font-size: 11.5px; }
        .ram-room-name { font-size: 11px; }
        .ram-room-dates { font-size: 9px; }
        .ram-room-guest { margin-top: 3px; }
        .ram-chip { width: 140px; padding: 5px 7px; }
        .ram-chip-name { font-size: 11px; }
        .ram-floor { padding: 8px; gap: 0; }
        .ram-wing-list { gap: 4px; }
        .ram-head { padding: 10px 14px 8px; }
        .ram-statusbar { padding: 0 14px 7px; }
        .ram-legend { padding: 5px 14px; }
      }
      .ram-sheet { display: flex; flex-direction: column; }

      .ram-datepicker {
        display: flex; align-items: center; justify-content: center; gap: 4px;
        padding: 0 14px 8px; flex-shrink: 0;
      }
      .ram-dp-btn {
        width: 28px; height: 28px; border-radius: 7px;
        background: var(--bg-tertiary); border: 1px solid var(--border-primary);
        color: var(--text-secondary);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; flex-shrink: 0;
        transition: background .12s;
      }
      .ram-dp-btn:hover { background: var(--bg-secondary); }
      .ram-dp-btn:active { transform: scale(0.92); }
      .ram-dp-date {
        display: flex; align-items: baseline; gap: 5px;
        padding: 4px 14px; border-radius: 8px;
        background: var(--bg-tertiary); border: 1px solid var(--border-primary);
        cursor: pointer; transition: all .15s;
      }
      .ram-dp-date:hover { background: var(--bg-secondary); }
      .ram-dp-today {
        background: rgba(91,124,255,0.12) !important;
        border-color: rgba(91,124,255,0.4) !important;
      }
      .ram-dp-label {
        font-size: 12px; font-weight: 700; color: var(--text-primary);
      }
      .ram-dp-weekday {
        font-size: 10px; color: var(--text-tertiary); font-weight: 500;
      }

      .ram-head {
        display: flex; align-items: center; gap: 9px;
        padding: 12px 14px 9px; flex-shrink: 0;
      }
      .ram-ico {
        width: 32px; height: 32px; border-radius: 9px;
        background: rgba(91,124,255,0.14); border: 1px solid rgba(91,124,255,0.45);
        color: #5B7CFF;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .ram-title { font-size: 15px; font-weight: 700; letter-spacing: -0.3px; }
      .ram-subtitle { font-size: 10.5px; color: var(--text-tertiary); margin-top: 1px; font-variant-numeric: tabular-nums; }
      .ram-close {
        width: 32px; height: 32px; border-radius: 9px;
        background: var(--bg-secondary); border: 1px solid var(--border-primary);
        color: var(--text-secondary);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        cursor: pointer;
      }

      .ram-statusbar {
        display: flex; align-items: center; gap: 0;
        padding: 0 14px 9px; flex-shrink: 0;
        overflow-x: auto; scrollbar-width: none;
      }
      .ram-statusbar::-webkit-scrollbar { display: none; }
      .ram-sb-item {
        display: flex; align-items: baseline; gap: 4px;
        padding-right: 10px; margin-right: 10px;
        border-right: 1px solid var(--border-primary);
        white-space: nowrap;
      }
      .ram-sb-item:last-child { border-right: none; }
      .ram-sb-k { font-size: 10px; color: var(--text-tertiary); }
      .ram-sb-v { font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .ram-c-occ { color: #5B7CFF; }
      .ram-c-free { color: #4ADE80; }
      .ram-c-arr { color: #F5B847; }
      .ram-c-lea { color: #5DC8E0; }

      .ram-staging {
        flex-shrink: 0; padding: 8px 0 9px;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border-primary);
        border-bottom: 1px solid var(--border-primary);
        transition: background .12s, box-shadow .12s;
      }
      .ram-staging.ram-valid {
        background: rgba(242,107,107,0.08) !important;
        box-shadow: inset 0 0 0 2px rgba(242,107,107,0.48);
      }
      .ram-staging.ram-drop-hover.ram-valid {
        box-shadow: inset 0 0 0 3px #F26B6B;
      }
      .ram-staging-empty {
        padding: 6px 14px;
        font-size: 11px;
        color: var(--text-tertiary);
      }
      .ram-staging-head {
        display: flex; align-items: center; gap: 6px;
        padding: 0 14px 7px;
      }
      .ram-staging-lbl {
        font-size: 11px; font-weight: 700;
        color: #F26B6B;
      }
      .ram-staging-cnt {
        font-size: 10px; font-weight: 700; color: #F26B6B;
        background: rgba(242,107,107,0.13); border: 1px solid rgba(242,107,107,0.48);
        padding: 1px 6px; border-radius: 9px;
      }
      .ram-staging-tip {
        margin-left: auto; font-size: 9.5px; color: var(--text-tertiary); font-style: italic;
      }
      .ram-staging-scroll {
        display: flex; gap: 7px; padding: 0 14px;
        overflow-x: auto; scrollbar-width: none;
        touch-action: pan-x;
      }
      .ram-staging-scroll::-webkit-scrollbar { display: none; }
      .ram-chip {
        flex-shrink: 0; width: 156px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-primary);
        border-radius: 8px; padding: 6px 8px;
        cursor: grab; user-select: none; -webkit-user-select: none;
      }
      .ram-chip-top { display: flex; align-items: center; gap: 5px; }
      .ram-chip-name {
        font-size: 11.5px; font-weight: 600; color: var(--text-primary);
        flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ram-chip-pax {
        display: inline-block; padding: 1px 7px;
        border-radius: 20px; background: var(--bg-card);
        border: 1px solid var(--border-primary);
        font-size: 9.5px; font-weight: 700; color: var(--text-primary);
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-variant-numeric: tabular-nums; flex-shrink: 0;
      }
      .ram-chip-bottom {
        display: flex; align-items: center; gap: 5px; margin-top: 4px; flex-wrap: nowrap;
      }
      .ram-chip-dates {
        font-size: 9px; color: var(--text-secondary);
        font-family: 'JetBrains Mono', ui-monospace, monospace;
      }
      .ram-chip-info {
        width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
        background: rgba(91,124,255,0.12); border: 1px solid rgba(91,124,255,0.3);
        color: #5B7CFF; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        margin-left: auto; transition: all .12s;
      }
      .ram-chip-info:hover { background: rgba(91,124,255,0.22); }
      .ram-chip-src {
        margin-left: auto; font-size: 8.5px; color: var(--text-tertiary);
        background: var(--bg-card); padding: 0.5px 4px; border-radius: 3px;
        white-space: nowrap;
      }

      .ram-legend {
        display: flex; gap: 11px;
        padding: 7px 14px; flex-shrink: 0;
        overflow-x: auto; scrollbar-width: none;
      }
      .ram-legend::-webkit-scrollbar { display: none; }
      .ram-lg { display: flex; align-items: center; gap: 4px; font-size: 9.5px; color: var(--text-secondary); white-space: nowrap; }
      .ram-sw { width: 8px; height: 8px; border-radius: 2.5px; border: 1px solid; }
      .ram-sw-free { background: rgba(74,222,128,0.11); border-color: rgba(74,222,128,0.42); }
      .ram-sw-stay { background: var(--bg-secondary); border-color: rgba(91,124,255,0.45); }
      .ram-sw-arr  { background: rgba(245,184,71,0.12); border-color: rgba(245,184,71,0.45); }
      .ram-sw-lea  { background: rgba(93,200,224,0.11); border-color: rgba(93,200,224,0.42); }

      .ram-floor {
        flex: 1; overflow-y: auto; overflow-x: hidden;
        padding: 10px;
        display: grid; grid-template-columns: 1fr 14px 1fr; gap: 0;
        align-items: start;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
      }
      .ram-floor::-webkit-scrollbar { width: 5px; }
      .ram-floor::-webkit-scrollbar-thumb { background: var(--border-primary); border-radius: 3px; }
      .ram-wing { display: flex; flex-direction: column; gap: 6px; }
      .ram-wing-label {
        font-size: 9px; text-transform: uppercase; letter-spacing: 1.2px;
        color: var(--text-tertiary); font-weight: 700; padding: 0 2px 1px; text-align: center;
      }
      .ram-wing-list { display: flex; flex-direction: column; gap: 6px; }
      .ram-corridor {
        align-self: stretch; margin: 18px 2px 0; border-radius: 3px;
        background: repeating-linear-gradient(45deg, var(--bg-secondary) 0 5px, var(--border-primary) 5px 10px);
        border-left: 1px solid var(--border-primary);
        border-right: 1px solid var(--border-primary);
        min-height: 240px;
      }
      .ram-empty { font-size: 11px; color: var(--text-tertiary); padding: 6px 2px; text-align: center; }

      .ram-room {
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        border-radius: 9px;
        padding: 7px 8px;
        transition: border-color .12s, box-shadow .12s, background .12s;
        user-select: none;
        -webkit-user-select: none;
      }
      .ram-room[data-ram-card] { cursor: grab; }
      .ram-room.ram-room-free {
        border-style: dashed; border-color: rgba(74,222,128,0.42);
        background: rgba(74,222,128,0.06);
        cursor: pointer;
      }
      .ram-room.ram-room-stay { border-left: 3px solid #5B7CFF; }
      .ram-room.ram-room-arr  { border-left: 3px solid #F5B847; background: rgba(245,184,71,0.06); }
      .ram-room.ram-room-lea  { border-left: 3px solid #5DC8E0; background: rgba(93,200,224,0.06); }

      .ram-room-top { display: flex; align-items: center; gap: 5px; }
      .ram-grip { color: var(--text-tertiary); }
      .ram-room-no { font-size: 12.5px; font-weight: 700; color: var(--text-primary); }
      .ram-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
      .ram-dot-free { background: #4ADE80; }
      .ram-dot-stay { background: #5B7CFF; }
      .ram-dot-arr  { background: #F5B847; }
      .ram-dot-lea  { background: #5DC8E0; }

      .ram-occ {
        margin-left: auto; display: flex; align-items: center; gap: 3px;
        padding: 2px 7px; border-radius: 20px;
        background: var(--bg-tertiary); border: 1px solid var(--border-primary);
      }
      .ram-occ-cap { font-size: 9.5px; font-weight: 700; color: var(--text-primary); font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
      .ram-occ-empty { background: rgba(74,222,128,0.1); border-color: rgba(74,222,128,0.4); }
      .ram-occ-empty .ram-occ-cap { color: #4ADE80; }
      .ram-occ-full { background: rgba(91,124,255,0.12); border-color: rgba(91,124,255,0.4); }

      .ram-room-guest { margin-top: 5px; }
      .ram-room-name {
        font-size: 12px; font-weight: 600; color: var(--text-primary);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ram-room-meta { display: flex; align-items: center; gap: 5px; margin-top: 2px; flex-wrap: wrap; }
      .ram-room-dates { font-size: 9.5px; color: var(--text-secondary); font-family: 'JetBrains Mono', ui-monospace, monospace; }
      .ram-room-free-text { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; }
      .ram-tag {
        font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 3px;
        text-transform: uppercase; letter-spacing: .2px; white-space: nowrap;
      }
      .ram-tag-arr        { background: rgba(245,184,71,0.14); color: #F5B847; border: 1px solid rgba(245,184,71,0.4); }
      .ram-tag-arr-strong { background: #F5B847; color: #1a1305; }
      .ram-tag-lea        { background: rgba(93,200,224,0.12); color: #5DC8E0; border: 1px solid rgba(93,200,224,0.4); }
      .ram-tag-lea-strong { background: #5DC8E0; color: #04161a; }

      [data-ram-dropzone].ram-valid {
        border-color: #4ADE80 !important; border-style: solid !important;
        box-shadow: 0 0 0 2px rgba(74,222,128,0.18);
        background: rgba(74,222,128,0.08);
      }
      [data-ram-dropzone].ram-swap {
        border-color: #5B7CFF !important;
        box-shadow: 0 0 0 2px rgba(91,124,255,0.18);
      }
      [data-ram-dropzone].ram-drop-hover.ram-valid {
        box-shadow: 0 0 0 3px #4ADE80;
      }
      [data-ram-dropzone].ram-drop-hover.ram-swap {
        box-shadow: 0 0 0 3px #5B7CFF;
      }
      .ram-room.ram-dragging { opacity: .35; }
      .ram-ghost {
        position: fixed; z-index: 9999; pointer-events: none;
        box-shadow: 0 16px 36px -6px rgba(0,0,0,0.7);
        transform: scale(1.03) rotate(-1.5deg);
        opacity: .96;
      }

      .ram-selbar {
        background: var(--accent-primary, #5B7CFF);
        color: #fff;
        padding: 9px 14px;
        font-size: 11.5px; font-weight: 600;
        display: flex; align-items: center; gap: 8px;
        flex-shrink: 0;
      }
      .ram-cancel-sel {
        margin-left: auto;
        background: rgba(255,255,255,0.18);
        border-radius: 6px; padding: 3px 9px;
        font-size: 11px; border: none; color: #fff; cursor: pointer;
      }

      .ram-toast {
        position: fixed; left: 50%; bottom: 22px;
        transform: translateX(-50%);
        background: var(--bg-card); border: 1px solid var(--border-primary);
        border-radius: 10px; padding: 9px 14px;
        font-size: 11.5px; font-weight: 500; color: var(--text-primary);
        box-shadow: 0 16px 40px -10px rgba(0,0,0,0.8);
        display: flex; align-items: center; gap: 7px;
        z-index: 10000; max-width: 90vw;
      }
      .ram-toast-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .ram-toast-ok  { border-color: rgba(74,222,128,0.42); }
      .ram-toast-ok  .ram-toast-dot { background: #4ADE80; }
      .ram-toast-err { border-color: rgba(242,107,107,0.48); }
      .ram-toast-err .ram-toast-dot { background: #F26B6B; }

      .ram-tabs { display: flex; gap: 4px; padding: 0 14px 8px; flex-shrink: 0; }
      .ram-tab { flex: 1; padding: 6px 0; border-radius: 8px; font-size: 12px; font-weight: 600; text-align: center; cursor: pointer; border: 1px solid var(--border-primary); background: var(--bg-tertiary); color: var(--text-secondary); transition: all .15s; }
      .ram-tab:hover { background: var(--bg-secondary); }
      .ram-tab-active { background: rgba(91,124,255,0.14) !important; border-color: rgba(91,124,255,0.45) !important; color: #5B7CFF !important; }

      .ram-detail-overlay {
        position: fixed; inset: 0; z-index: 10001;
        background: rgba(0,0,0,0.45);
        display: flex; align-items: center; justify-content: center;
        animation: ram-fade-in 0.15s ease;
      }
      @keyframes ram-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .ram-detail {
        background: var(--bg-primary); border: 1px solid var(--border-primary);
        border-radius: 14px; width: 340px; max-width: 92vw;
        box-shadow: 0 16px 48px -8px rgba(0,0,0,0.5);
        animation: ram-pop-in 0.2s cubic-bezier(0.32,0.72,0,1);
      }
      .ram-detail-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px 8px; border-bottom: 1px solid var(--border-primary);
      }
      .ram-detail-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
      .ram-detail-grid { padding: 10px 14px; }
      .ram-detail-row {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 4px 0; gap: 8px;
      }
      .ram-detail-k { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }
      .ram-detail-v { font-size: 11.5px; color: var(--text-primary); text-align: right; word-break: break-word; }
      .ram-detail-actions {
        padding: 8px 14px 12px; border-top: 1px solid var(--border-primary);
      }
      .ram-detail-del {
        width: 100%; padding: 7px; border-radius: 8px; font-size: 12px; font-weight: 600;
        background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
        color: #ef4444; cursor: pointer; transition: all .15s;
      }
      .ram-detail-del:hover { background: rgba(239,68,68,0.18); }
      .ram-detail-confirm {
        display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary);
      }
      .ram-detail-del-yes {
        padding: 5px 14px; border-radius: 6px; font-size: 11px; font-weight: 700;
        background: #ef4444; border: none; color: #fff; cursor: pointer;
      }
      .ram-detail-del-no {
        padding: 5px 14px; border-radius: 6px; font-size: 11px; font-weight: 600;
        background: var(--bg-tertiary); border: 1px solid var(--border-primary); color: var(--text-secondary); cursor: pointer;
      }
    `}</style>
  );
}
