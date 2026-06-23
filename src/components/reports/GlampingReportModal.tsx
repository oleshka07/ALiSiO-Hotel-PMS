/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { X, Loader2, Download } from 'lucide-react';

const CZK_TO_EUR = 23.5;
const toEur = (czk: number) => (czk / CZK_TO_EUR).toFixed(1);

interface GlampingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  from: string;
  to: string;
}

export default function GlampingReportModal({ isOpen, onClose, from, to }: GlampingReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/reports/glamping?from=${from}&to=${to}`);
        const json = await res.json();
        if (active) setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }
    
    load();
    return () => { active = false; };
  }, [isOpen, from, to]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h2 className="modal-title">Звіт по будинках Глемпінгу</h2>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
            Період: <strong>{from}</strong> — <strong>{to}</strong>
          </div>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: 64 }}>
              <Loader2 size={28} className="animate-pulse" style={{ display: 'inline-block' }} />
              <div style={{ marginTop: 8, color: 'var(--text-tertiary)' }}>Формування звіту...</div>
            </div>
          ) : data?.houses ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Будинок</th>
                    <th style={{ textAlign: 'center' }}>Завантаження</th>
                    <th style={{ textAlign: 'center' }}>Бронювання</th>
                    <th style={{ textAlign: 'right' }}>Дохідність</th>
                  </tr>
                </thead>
                <tbody>
                  {data.houses.map((h: any) => (
                    <tr key={h.unitId}>
                      <td style={{ fontWeight: 500 }}>{h.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        {h.occPct}% <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>({h.occupiedDays} днів)</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{h.bookings}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {h.revenue.toLocaleString()} {h.currency}
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 'normal' }}>
                          ≈ {toEur(h.revenue)} EUR
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 600 }}>
                    <td>РАЗОМ</td>
                    <td style={{ textAlign: 'center' }}>
                      {Math.round((data.houses.reduce((s: number, h: any) => s + h.occupiedDays, 0) / (data.period.days * data.houses.length)) * 100)}%
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {data.houses.reduce((s: number, h: any) => s + h.bookings, 0)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {data.houses.reduce((s: number, h: any) => s + h.revenue, 0).toLocaleString()} CZK
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Немає даних</div>
          )}
        </div>
      </div>
    </div>
  );
}
