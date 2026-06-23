'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Search, Download, Filter, CheckCircle2,
  AlertTriangle, Users, Globe, Banknote, ChevronLeft, ChevronRight,
  Eye, X, Check,
} from 'lucide-react';

interface RegistryEntry {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  nationality: string | null;
  document_type: string | null;
  document_number: string | null;
  address: string | null;
  visa_number: string | null;
  purpose_of_stay: string | null;
  is_foreigner: number;
  fee_amount: number;
  fee_exempt: number;
  fee_exempt_reason: string | null;
  police_reported: number;
  police_reported_at: string | null;
  police_report_ref: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  unit_name: string;
  unit_code: string;
  reservation_id: string;
  guest_id: string | null;
}

interface RegistrySummary {
  totalGuests: number;
  foreigners: number;
  registeredPolice: number;
  unregisteredPolice: number;
  totalFees: number;
  exemptGuests: number;
}

const DOC_LABELS: Record<string, string> = {
  passport: 'Cestovní pas',
  id_card: 'Občanský průkaz',
  driving_license: 'Řidičský průkaz',
  other: 'Jiný',
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const months = [
    'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
    'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
  ];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function GuestRegistryPage() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [summary, setSummary] = useState<RegistrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [foreignersOnly, setForeignersOnly] = useState(false);
  const [unregisteredOnly, setUnregisteredOnly] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<RegistryEntry | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [hideConfirm, setHideConfirm] = useState<RegistryEntry | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (foreignersOnly) params.set('foreignersOnly', 'true');
      if (unregisteredOnly) params.set('unregisteredOnly', 'true');
      if (search) params.set('search', search);

      const res = await fetch(`/api/guest-registry?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setSummary(data.summary || null);
      } else {
        const errText = await res.text();
        console.error('[GuestRegistry] API error:', res.status, errText);
      }
    } catch (e) {
      console.error('[GuestRegistry] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [month, foreignersOnly, unregisteredOnly, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePoliceToggle = async (entry: RegistryEntry) => {
    setUpdating(entry.id);
    try {
      const action = entry.police_reported ? 'unmark_police' : 'mark_police';
      await fetch(`/api/guest-registry/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await fetchData();
    } catch (e) {
      console.error('[GuestRegistry] toggle error:', e);
    } finally {
      setUpdating(null);
    }
  };

  const handleHide = async (entry: RegistryEntry) => {
    setUpdating(entry.id);
    try {
      await fetch(`/api/guest-registry/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide' }),
      });
      await fetchData();
      setHideConfirm(null);
    } catch (e) {
      console.error('[GuestRegistry] hide error:', e);
    } finally {
      setUpdating(null);
    }
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams({ month, format: 'csv' });
    if (foreignersOnly) params.set('foreignersOnly', '1');
    if (unregisteredOnly) params.set('unregisteredOnly', '1');
    if (search) params.set('search', search);
    window.open(`/api/guest-registry?${params}`, '_blank');
  };

  return (
    <div className="registry-page">
      {/* Header */}
      <div className="registry-header">
        <div className="registry-header-left">
          <ClipboardList size={28} className="registry-header-icon" />
          <div>
            <h1>Evidenční a domovní kniha (Ubytovací kniha)</h1>
            <p className="registry-subtitle">Kniha ubytovaných hostů</p>
          </div>
        </div>
        <button className="registry-export-btn" onClick={handleExportCSV}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Month Selector */}
      <div className="registry-month-nav">
        <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="registry-month-btn">
          <ChevronLeft size={20} />
        </button>
        <span className="registry-month-label">{getMonthLabel(month)}</span>
        <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="registry-month-btn">
          <ChevronRight size={20} />
        </button>
        {month !== getCurrentMonth() && (
          <button className="registry-today-btn" onClick={() => setMonth(getCurrentMonth())}>
            Dnes
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="registry-summary">
          <div className="registry-card">
            <Users size={20} />
            <div className="registry-card-value">{summary.totalGuests}</div>
            <div className="registry-card-label">Celkem hostů</div>
          </div>
          <div className="registry-card card-foreign">
            <Globe size={20} />
            <div className="registry-card-value">{summary.foreigners}</div>
            <div className="registry-card-label">Cizinců</div>
          </div>
          <div className="registry-card card-police">
            <CheckCircle2 size={20} />
            <div className="registry-card-value">{summary.registeredPolice}/{summary.foreigners}</div>
            <div className="registry-card-label">Nahlášeno policie</div>
          </div>
          {summary.unregisteredPolice > 0 && (
            <div className="registry-card card-warning">
              <AlertTriangle size={20} />
              <div className="registry-card-value">{summary.unregisteredPolice}</div>
              <div className="registry-card-label">Nenahlášeno!</div>
            </div>
          )}
          <div className="registry-card card-fee">
            <Banknote size={20} />
            <div className="registry-card-value">{summary.totalFees.toLocaleString()} CZK</div>
            <div className="registry-card-label">Poplatky celkem</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="registry-filters">
        <div className="registry-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Hledat jméno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className={`registry-filter-btn ${foreignersOnly ? 'active' : ''}`}
          onClick={() => setForeignersOnly(!foreignersOnly)}
        >
          <Filter size={14} /> Pouze cizinci
        </button>
        <button
          className={`registry-filter-btn ${unregisteredOnly ? 'active' : ''}`}
          onClick={() => setUnregisteredOnly(!unregisteredOnly)}
        >
          <AlertTriangle size={14} /> Nenahlášení
        </button>
      </div>

      {/* Table */}
      <div className="registry-table-wrap">
        <table className="registry-table">
          <thead>
            <tr>
              <th className="th-police">UbyPort</th>
              <th>Jméno</th>
              <th>Nar.</th>
              <th>Stát</th>
              <th>Doklad</th>
              <th>Ubytování</th>
              <th>Příjezd</th>
              <th>Odjezd</th>
              <th>Noci</th>
              <th>Účel</th>
              <th>Poplatek</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="registry-empty">Načítání...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={12} className="registry-empty">Žádní hosté v tomto měsíci</td></tr>
            ) : entries.map((e) => (
              <tr
                key={e.id}
                className={`${e.is_foreigner && !e.police_reported ? 'row-warning' : ''} ${e.police_reported ? 'row-reported' : ''}`}
              >
                <td className="td-police">
                  {e.is_foreigner ? (
                    <button
                      className={`police-btn ${e.police_reported ? 'reported' : 'unreported'}`}
                      onClick={() => handlePoliceToggle(e)}
                      disabled={updating === e.id}
                      title={e.police_reported
                        ? `Nahlášeno ${e.police_reported_at ? formatDate(e.police_reported_at) : ''}`
                        : 'Označ jako nahlášeno'}
                    >
                      {e.police_reported ? <Check size={16} /> : <AlertTriangle size={16} />}
                    </button>
                  ) : (
                    <span className="police-na">—</span>
                  )}
                </td>
                <td className="td-name">
                  <span className="guest-name">{e.first_name} {e.last_name}</span>
                  {e.is_foreigner ? <span className="badge-foreign">🌍</span> : null}
                </td>
                <td>{e.date_of_birth ? formatDate(e.date_of_birth) : '—'}</td>
                <td>{e.nationality || '—'}</td>
                <td>
                  {e.document_type ? (
                    <span title={e.document_number || ''}>
                      {DOC_LABELS[e.document_type] || e.document_type}
                      {e.document_number ? `: ${e.document_number}` : ''}
                    </span>
                  ) : '—'}
                </td>
                <td className="td-unit">
                  <span
                    className="unit-badge unit-badge-clickable"
                    onClick={() => setHideConfirm(e)}
                    title="Klikněte pro skrytí z evidence"
                  >
                    {e.unit_code || e.unit_name}
                  </span>
                </td>
                <td>{formatDate(e.check_in)}</td>
                <td>{formatDate(e.check_out)}</td>
                <td className="td-center">{e.nights}</td>
                <td>{e.purpose_of_stay || '—'}</td>
                <td className="td-fee">
                  {e.fee_exempt ? (
                    <span className="fee-exempt" title={e.fee_exempt_reason || 'Osvobozeno'}>0 CZK</span>
                  ) : (
                    <span>{e.fee_amount ? `${e.fee_amount} CZK` : '—'}</span>
                  )}
                </td>
                <td>
                  <button className="detail-btn" onClick={() => setSelectedEntry(e)} title="Detail">
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hide Confirmation Popup */}
      {hideConfirm && (
        <div className="registry-modal-backdrop" onClick={() => setHideConfirm(null)}>
          <div className="registry-hide-popup" onClick={(e) => e.stopPropagation()}>
            <div className="registry-hide-popup-icon">👁️🗨️</div>
            <h3>Skrýt z evidence?</h3>
            <p>
              <strong>{hideConfirm.first_name} {hideConfirm.last_name}</strong>
              <br />
              {hideConfirm.unit_code || hideConfirm.unit_name} · {formatDate(hideConfirm.check_in)} – {formatDate(hideConfirm.check_out)}
            </p>
            <p className="hide-note">Záznam bude skrytý z tabulky i z CSV exportu. Lze obnovit v databázi.</p>
            <div className="registry-hide-actions">
              <button className="hide-cancel" onClick={() => setHideConfirm(null)}>Zrušit</button>
              <button
                className="hide-confirm"
                onClick={() => handleHide(hideConfirm)}
                disabled={updating === hideConfirm.id}
              >
                {updating === hideConfirm.id ? 'Skrývám...' : 'Skrýt záznam'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="registry-modal-backdrop" onClick={() => setSelectedEntry(null)}>
          <div className="registry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="registry-modal-header">
              <h2>Detail hosta</h2>
              <button onClick={() => setSelectedEntry(null)}><X size={20} /></button>
            </div>
            <div className="registry-modal-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <label>Jméno a příjmení</label>
                  <span>{selectedEntry.first_name} {selectedEntry.last_name}</span>
                </div>
                <div className="detail-field">
                  <label>Datum narození</label>
                  <span>{formatDate(selectedEntry.date_of_birth)}</span>
                </div>
                <div className="detail-field">
                  <label>Státní příslušnost</label>
                  <span>{selectedEntry.nationality || '—'}</span>
                </div>
                <div className="detail-field">
                  <label>Typ dokladu</label>
                  <span>{selectedEntry.document_type ? DOC_LABELS[selectedEntry.document_type] || selectedEntry.document_type : '—'}</span>
                </div>
                <div className="detail-field">
                  <label>Číslo dokladu</label>
                  <span>{selectedEntry.document_number || '—'}</span>
                </div>
                <div className="detail-field">
                  <label>Adresa</label>
                  <span>{selectedEntry.address || '—'}</span>
                </div>
                <div className="detail-field">
                  <label>Číslo víza</label>
                  <span>{selectedEntry.visa_number || '—'}</span>
                </div>
                <div className="detail-field">
                  <label>Účel pobytu</label>
                  <span>{selectedEntry.purpose_of_stay || '—'}</span>
                </div>
                <hr />
                <div className="detail-field">
                  <label>Ubytování</label>
                  <span>{selectedEntry.unit_code || selectedEntry.unit_name}</span>
                </div>
                <div className="detail-field">
                  <label>Příjezd — Odjezd</label>
                  <span>{formatDate(selectedEntry.check_in)} — {formatDate(selectedEntry.check_out)} ({selectedEntry.nights} nocí)</span>
                </div>
                <div className="detail-field">
                  <label>Poplatek z pobytu</label>
                  <span>{selectedEntry.fee_exempt ? 'Osvobozeno' : `${selectedEntry.fee_amount} CZK`}</span>
                </div>
                {selectedEntry.is_foreigner ? (
                  <div className="detail-field">
                    <label>UbyPort</label>
                    <span className={selectedEntry.police_reported ? 'status-ok' : 'status-warn'}>
                      {selectedEntry.police_reported
                        ? `✅ Nahlášeno ${selectedEntry.police_reported_at ? formatDate(selectedEntry.police_reported_at) : ''}`
                        : '⚠️ Nenahlášeno'}
                      {selectedEntry.police_report_ref ? ` (ref: ${selectedEntry.police_report_ref})` : ''}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .registry-page {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px;
        }

        .registry-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .registry-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .registry-header-icon {
          color: var(--accent, #6366f1);
        }

        .registry-header h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary, #fff);
        }

        .registry-subtitle {
          font-size: 13px;
          color: var(--text-secondary, #94a3b8);
          margin: 2px 0 0;
        }

        .registry-export-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--border, #334155);
          background: var(--bg-card, #1e293b);
          color: var(--text-primary, #fff);
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        .registry-export-btn:hover {
          background: var(--accent, #6366f1);
          border-color: var(--accent, #6366f1);
        }

        /* Month Navigation */
        .registry-month-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .registry-month-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--border, #334155);
          background: var(--bg-card, #1e293b);
          color: var(--text-primary, #fff);
          cursor: pointer;
          transition: all 0.2s;
        }
        .registry-month-btn:hover {
          background: var(--accent, #6366f1);
          border-color: var(--accent, #6366f1);
        }

        .registry-month-label {
          font-size: 18px;
          font-weight: 600;
          min-width: 180px;
          text-align: center;
          color: var(--text-primary, #fff);
        }

        .registry-today-btn {
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid var(--accent, #6366f1);
          background: transparent;
          color: var(--accent, #6366f1);
          cursor: pointer;
          font-size: 12px;
        }

        /* Summary Cards */
        .registry-summary {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .registry-card {
          flex: 1;
          min-width: 140px;
          padding: 16px;
          border-radius: 12px;
          background: var(--bg-card, #1e293b);
          border: 1px solid var(--border, #334155);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          color: var(--text-secondary, #94a3b8);
        }
        .registry-card-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary, #fff);
        }
        .registry-card-label {
          font-size: 12px;
        }
        .card-foreign { border-color: #3b82f6; }
        .card-foreign svg { color: #3b82f6; }
        .card-police { border-color: #22c55e; }
        .card-police svg { color: #22c55e; }
        .card-warning { border-color: #f59e0b; background: rgba(245, 158, 11, 0.08); }
        .card-warning svg { color: #f59e0b; }
        .card-warning .registry-card-value { color: #f59e0b; }
        .card-fee { border-color: #8b5cf6; }
        .card-fee svg { color: #8b5cf6; }

        /* Filters */
        .registry-filters {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .registry-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--border, #334155);
          background: var(--bg-card, #1e293b);
          flex: 1;
          min-width: 200px;
          color: var(--text-secondary, #94a3b8);
        }
        .registry-search input {
          border: none;
          background: transparent;
          outline: none;
          color: var(--text-primary, #fff);
          font-size: 14px;
          width: 100%;
        }

        .registry-filter-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid var(--border, #334155);
          background: var(--bg-card, #1e293b);
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        .registry-filter-btn:hover {
          border-color: var(--accent, #6366f1);
          color: var(--accent, #6366f1);
        }
        .registry-filter-btn.active {
          background: rgba(99, 102, 241, 0.15);
          border-color: var(--accent, #6366f1);
          color: var(--accent, #6366f1);
        }

        /* Table */
        .registry-table-wrap {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid var(--border, #334155);
          background: var(--bg-card, #1e293b);
        }

        .registry-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .registry-table th {
          padding: 12px 10px;
          text-align: left;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary, #94a3b8);
          border-bottom: 1px solid var(--border, #334155);
          white-space: nowrap;
        }

        .registry-table td {
          padding: 10px 10px;
          border-bottom: 1px solid var(--border-light, rgba(255,255,255,0.04));
          color: var(--text-primary, #e2e8f0);
          white-space: nowrap;
        }

        .registry-table tbody tr:hover {
          background: rgba(99, 102, 241, 0.04);
        }

        .row-warning {
          background: rgba(245, 158, 11, 0.04) !important;
        }
        .row-warning:hover {
          background: rgba(245, 158, 11, 0.08) !important;
        }

        .row-reported td:first-child {
          border-left: 3px solid #22c55e;
        }

        .th-police { width: 60px; text-align: center; }
        .td-police { text-align: center; }

        .police-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .police-btn.reported {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }
        .police-btn.reported:hover {
          background: rgba(34, 197, 94, 0.25);
        }
        .police-btn.unreported {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          animation: pulse-warn 2s infinite;
        }
        .police-btn.unreported:hover {
          background: rgba(245, 158, 11, 0.25);
        }

        @keyframes pulse-warn {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .police-na {
          color: var(--text-secondary, #475569);
        }

        .td-name { font-weight: 500; }
        .guest-name { margin-right: 6px; }
        .badge-foreign {
          font-size: 12px;
          vertical-align: middle;
        }

        .td-unit {}
        .unit-badge {
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(99, 102, 241, 0.1);
          color: var(--accent, #6366f1);
          font-size: 12px;
          font-weight: 600;
        }

        .td-center { text-align: center; }

        .td-fee {}
        .fee-exempt {
          color: var(--text-secondary, #475569);
          font-style: italic;
        }

        .detail-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border, #334155);
          background: transparent;
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          transition: all 0.2s;
        }
        .detail-btn:hover {
          background: var(--accent, #6366f1);
          border-color: var(--accent, #6366f1);
          color: #fff;
        }

        .registry-empty {
          text-align: center;
          padding: 40px !important;
          color: var(--text-secondary, #475569);
          font-style: italic;
        }

        /* Modal */
        .registry-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .registry-modal {
          background: var(--bg-card, #1e293b);
          border-radius: 16px;
          border: 1px solid var(--border, #334155);
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
        }

        .registry-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border, #334155);
        }
        .registry-modal-header h2 {
          margin: 0;
          font-size: 18px;
          color: var(--text-primary, #fff);
        }
        .registry-modal-header button {
          display: flex;
          align-items: center;
          border: none;
          background: transparent;
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
        }
        .registry-modal-header button:hover {
          color: var(--text-primary, #fff);
          background: rgba(255,255,255,0.06);
        }

        .registry-modal-body {
          padding: 24px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .detail-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .detail-field label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary, #64748b);
        }
        .detail-field span {
          font-size: 14px;
          color: var(--text-primary, #e2e8f0);
        }

        .detail-grid hr {
          grid-column: 1 / -1;
          border: none;
          border-top: 1px solid var(--border, #334155);
          margin: 4px 0;
        }

        .status-ok { color: #22c55e; }
        .status-warn { color: #f59e0b; }

        /* Responsive */
        @media (max-width: 768px) {
          .registry-page { padding: 16px; }
          .registry-summary { flex-direction: column; }
          .registry-card { min-width: unset; }
          .detail-grid { grid-template-columns: 1fr; }
        }

        .unit-badge-clickable {
          cursor: pointer;
          transition: all 0.15s;
        }
        .unit-badge-clickable:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          transform: scale(1.05);
        }
        .registry-hide-popup {
          background: var(--surface, #1e1e2e);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 24px;
          max-width: 380px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .registry-hide-popup-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }
        .registry-hide-popup h3 {
          margin: 0 0 12px;
          font-size: 18px;
          color: #fff;
        }
        .registry-hide-popup p {
          color: rgba(255,255,255,0.7);
          font-size: 14px;
          margin: 0 0 8px;
          line-height: 1.5;
        }
        .hide-note {
          font-size: 12px !important;
          color: rgba(255,255,255,0.4) !important;
          font-style: italic;
        }
        .registry-hide-actions {
          display: flex;
          gap: 10px;
          margin-top: 16px;
          justify-content: center;
        }
        .hide-cancel {
          padding: 8px 20px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.15);
          background: transparent;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          font-size: 14px;
        }
        .hide-cancel:hover {
          background: rgba(255,255,255,0.05);
        }
        .hide-confirm {
          padding: 8px 20px;
          border-radius: 8px;
          border: none;
          background: #ef4444;
          color: #fff;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
        .hide-confirm:hover {
          background: #dc2626;
        }
        .hide-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
