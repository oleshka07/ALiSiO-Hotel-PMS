'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, ExternalLink, Calendar, MapPin, Target, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import BookingViewModal from '@/components/booking/BookingViewModal';

interface BookingsTabProps {
  siteId: string;
}

export function BookingsTab({ siteId }: BookingsTabProps) {
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [sortField, setSortField] = useState<'created_at' | 'check_in' | 'total_price' | 'guest'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  });

  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [modalData, setModalData] = useState<any>({ payments: [], registrations: [], activityLog: [] });

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/bookings?date_from=${dateFrom}&date_to=${dateTo}`;
      if (siteId !== 'all') {
         // Not strictly required since siteId 'all' is the only one showing this tab now, but good for future
         // Assuming siteId corresponds to a specific widget source if it's not 'all'
         // We might filter by source if needed.
      }
      
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBookings(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, siteId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleRowClick = async (booking: any) => {
    // Open standard booking modal
    try {
      const res = await fetch(`/api/bookings/${booking.id}`);
      const fullBooking = await res.json();
      
      const payRes = await fetch(`/api/payments?reservation_id=${booking.id}`);
      const payData = await payRes.json();
      
      const regRes = await fetch(`/api/bookings/${booking.id}/registrations`);
      const regData = await regRes.json();
      
      setModalData({
        payments: Array.isArray(payData) ? payData : [],
        registrations: Array.isArray(regData) ? regData : [],
        activityLog: []
      });
      setSelectedBooking(fullBooking);
    } catch (e) {
      console.error('Failed to load booking details', e);
    }
  };

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    
    if (statusFilter && b.status !== statusFilter) return false;
    if (paymentFilter && b.payment_status !== paymentFilter) return false;

    return (
      b.first_name?.toLowerCase().includes(q) ||
      b.last_name?.toLowerCase().includes(q) ||
      b.unit_name?.toLowerCase().includes(q) ||
      b.utm_source?.toLowerCase().includes(q) ||
      b.utm_campaign?.toLowerCase().includes(q) ||
      b.utm_content?.toLowerCase().includes(q) ||
      b.utm_term?.toLowerCase().includes(q)
    );
  }).sort((a, b) => {
    let valA, valB;
    if (sortField === 'created_at') { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
    else if (sortField === 'check_in') { valA = new Date(a.check_in).getTime(); valB = new Date(b.check_in).getTime(); }
    else if (sortField === 'total_price') { valA = a.total_price; valB = b.total_price; }
    else { valA = (a.first_name + ' ' + a.last_name).toLowerCase(); valB = (b.first_name + ' ' + b.last_name).toLowerCase(); }
    
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, statusFilter, paymentFilter, sortField, sortOrder, dateFrom, dateTo]);

  const handleSort = (field: 'created_at' | 'check_in' | 'total_price' | 'guest') => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
            <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140, padding: '6px 10px' }} />
          </div>
          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
            <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140, padding: '6px 10px' }} />
          </div>
          
          <div style={{ position: 'relative', width: 240, marginLeft: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="Пошук за іменем, UTM..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              style={{ paddingLeft: 32, height: 32 }} 
            />
          </div>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 32, padding: '4px 10px', fontSize: 13, width: 140 }}>
            <option value="">Всі статуси</option>
            <option value="confirmed">Підтверджені</option>
            <option value="tentative">Попередні</option>
            <option value="cancelled">Скасовані</option>
            <option value="checked_in">Заселені</option>
            <option value="checked_out">Виселені</option>
          </select>
          <select className="form-input" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} style={{ height: 32, padding: '4px 10px', fontSize: 13, width: 140 }}>
            <option value="">Всі оплати</option>
            <option value="paid">Оплачено</option>
            <option value="unpaid">Не оплачено</option>
            <option value="payment_requested">Запит оплати</option>
          </select>
        </div>

        <button className="btn btn-secondary" onClick={fetchBookings} style={{ padding: '6px 12px', height: 32 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Оновити
        </button>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
            <Loader2 size={32} className="spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Не знайдено бронювань за вказаний період
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer', userSelect: 'none' }}>ID / Створено {sortField === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => handleSort('guest')} style={{ cursor: 'pointer', userSelect: 'none' }}>Гість {sortField === 'guest' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => handleSort('check_in')} style={{ cursor: 'pointer', userSelect: 'none' }}>Будинок / Дати {sortField === 'check_in' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => handleSort('total_price')} style={{ cursor: 'pointer', userSelect: 'none' }}>Сума {sortField === 'total_price' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
                  <th>Джерело (UTM)</th>
                  <th>Деталі (Креатив/Ключ)</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(b => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => handleRowClick(b)}>
                    <td>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{b.id.substring(0, 12)}...</div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {new Date(b.created_at + 'Z').toLocaleString('uk-UA', { 
                          day: '2-digit', month: '2-digit', year: 'numeric', 
                          hour: '2-digit', minute: '2-digit', second: '2-digit' 
                        })}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.first_name} {b.last_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{b.guest_email || b.guest_phone || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{b.unit_name || b.unit_code}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {b.check_in} <span style={{color:'var(--text-tertiary)'}}>→</span> {b.check_out} ({b.nights} н.)
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{b.total_price?.toLocaleString()} {b.currency || 'CZK'}</div>
                      <div style={{ fontSize: 11, color: b.payment_status === 'paid' ? '#22c55e' : '#f59e0b' }}>
                        {b.payment_status === 'paid' ? 'Оплачено' : 'Очікує'}
                      </div>
                    </td>
                    <td>
                      {(b.utm_source || b.utm_medium || b.utm_campaign) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {b.utm_source && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>src: {b.utm_source}</span>}
                          {b.utm_medium && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>med: {b.utm_medium}</span>}
                          {b.utm_campaign && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>cmp: {b.utm_campaign}</span>}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{b.source || 'direct'}</span>
                      )}
                    </td>
                    <td>
                      {(b.utm_content || b.utm_term || b.gclid || b.fbclid || (b.notes && b.notes.includes('Джерело'))) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {b.notes && b.notes.includes('Джерело') && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: '1.4', paddingBottom: 4 }}>
                              {b.notes}
                            </div>
                          )}
                          {b.utm_content && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>crtv: {b.utm_content}</span>}
                          {b.utm_term && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>term: {b.utm_term}</span>}
                          {b.gclid && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>gclid: {b.gclid}</span>}
                          {b.fbclid && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>fbclid: {b.fbclid}</span>}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: '16px 0', borderTop: '1px solid var(--border-color)' }}>
                <button 
                  className="btn btn-secondary" 
                  disabled={page === 1} 
                  onClick={() => setPage(p => p - 1)}
                  style={{ padding: '6px 12px' }}
                >
                  Попередня
                </button>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Сторінка {page} з {totalPages}
                </span>
                <button 
                  className="btn btn-secondary" 
                  disabled={page === totalPages} 
                  onClick={() => setPage(p => p + 1)}
                  style={{ padding: '6px 12px' }}
                >
                  Наступна
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedBooking && (
        <BookingViewModal
          booking={selectedBooking}
          payments={modalData.payments}
          registrations={modalData.registrations}
          activityLog={modalData.activityLog}
          sourceMap={{
            direct: { label: 'Пряме', color: '#64748b' },
            widget: { label: 'Віджет', color: '#6366f1' },
            booking: { label: 'Booking.com', color: '#003580' }
          }}
          onClose={() => setSelectedBooking(null)}
          onEdit={() => {}}
          onChangeStatus={async (id, status) => {
            await fetch(`/api/bookings/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            });
            fetchBookings();
            setSelectedBooking(null);
          }}
          onFetchPayments={() => {}}
          onFetchBookings={fetchBookings}
          onFetchRegistrations={() => {}}
          showToast={() => {}}
          setBooking={setSelectedBooking}
        />
      )}
    </div>
  );
}
