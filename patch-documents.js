/**
 * Safely patches documents/page.tsx to add:
 * 1. Trash2 import
 * 2. deleteConfirm state + handleDeleteInvoice function
 * 3. CSV export <a> button in the search bar row
 * 4. Trash2 delete button in each invoice row
 * 5. Delete confirmation modal (before the custom modal)
 */
const fs = require('fs');
const file = 'src/app/(dashboard)/documents/page.tsx';
let src = fs.readFileSync(file, 'utf8');

// ── 1. Add Trash2 to lucide imports ──────────────────────────────────────────
src = src.replace(
  /Sparkles, Send, Building2, FileDown, Loader2, Search,/,
  'Sparkles, Send, Building2, FileDown, Loader2, Search, Trash2,'
);

// ── 2. Add delete state + handler before "Custom Invoice Modal state" ─────────
const deleteStateBlock = `  // ── Delete confirmation state ──────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; number: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteInvoice = async (id: string) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(\`/api/invoices/\${id}\`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Error');
      setDeleteConfirm(null);
      // Refresh both lists
      fetchInvoices();
      fetchAllInvoices(invSourceFilter, invSearch);
    } catch (e: unknown) {
      alert('Помилка видалення: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeleteLoading(false);
    }
  };

  `;

src = src.replace(
  /  \/\/ ── Custom Invoice Modal state ────────────────────────────────\r?\n/,
  deleteStateBlock + '  // ── Custom Invoice Modal state ────────────────────────────────\n'
);

// ── 3. Add CSV export button after the search input closing </div> ─────────────
const csvButtonHtml = `                  {/* CSV Export button */}
                  <a
                    href={\`/api/invoices/export?source=\${invSourceFilter}\`}
                    download
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border-primary)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    <Download size={13} /> Скачати CSV
                  </a>
                </div>`;

src = src.replace(
  /                  \{invSearch && \(\n                    <button onClick=\{.*?XCircle.*?<\/button>\n                  \)\}\n                <\/div>\n              <\/div>/s,
  (m) => m.replace(
    /                <\/div>\n              <\/div>$/,
    `                </div>\n` + csvButtonHtml
  )
);

// ── 4. Add Trash2 delete button after the ISDOC button in each invoice row ─────
src = src.replace(
  /<button className="btn btn-sm btn-ghost btn-icon" title="ISDOC" onClick=\{.*?downloadIsdoc.*?\}>\s*<FileCode size=\{14\} \/>\s*<\/button>\n(\s*)<\/div>\n(\s*)<\/td>\n(\s*)<\/tr>/s,
  (m, sp1, sp2, sp3) => `<button className="btn btn-sm btn-ghost btn-icon" title="ISDOC" onClick={() => downloadIsdoc(inv.id, inv.invoice_number)}>
                                  <FileCode size={14} />
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost btn-icon"
                                  title="Видалити фактуру"
                                  onClick={() => setDeleteConfirm({ id: inv.id, number: inv.invoice_number })}
                                  style={{ color: 'var(--accent-danger, #ef4444)', opacity: 0.75 }}
                                >
                                  <Trash2 size={14} />
                                </button>
${sp1}</div>
${sp2}</td>
${sp3}</tr>`
);

// ── 5. Insert delete confirmation modal before the custom invoice modal ────────
const deleteModal = `        {/* ════════════════════════════════════════════════
            DELETE CONFIRMATION MODAL
        ════════════════════════════════════════════════ */}
        {deleteConfirm && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => !deleteLoading && setDeleteConfirm(null)}>
            <div
              style={{ background: 'var(--surface-elevated, #1e1e2e)', borderRadius: 12, padding: '28px 32px', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={20} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Видалити фактуру?</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Цю дію неможливо скасувати.</div>
                </div>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Фактура </span>
                <strong style={{ color: '#ef4444' }}>{deleteConfirm.number}</strong>
                <span style={{ color: 'var(--text-secondary)' }}> буде назавжди видалена з бази даних.</span>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost"
                  disabled={deleteLoading}
                  onClick={() => setDeleteConfirm(null)}
                  style={{ minWidth: 90 }}
                >
                  Скасувати
                </button>
                <button
                  className="btn"
                  disabled={deleteLoading}
                  onClick={() => handleDeleteInvoice(deleteConfirm.id)}
                  style={{ minWidth: 120, background: '#ef4444', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {deleteLoading
                    ? <><RefreshCw size={14} className="spin" /> Видаляє...</>
                    : <><Trash2 size={14} /> Видалити</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        `;

src = src.replace(
  /        \{\/\* ════════════════ MODAL: ВІЛЬНА ФАКТУРА ════════════════ \*\/\}/,
  deleteModal + `        {/* ════════════════ MODAL: ВІЛЬНА ФАКТУРА ════════════════ */}`
);

// Write result
fs.writeFileSync(file, src, 'utf8');

// Verify patches
const lines = src.split('\n');
console.log('Total lines:', lines.length);
console.log('Has Trash2 import:', src.includes('Search, Trash2,'));
console.log('Has deleteConfirm state:', src.includes('const [deleteConfirm'));
console.log('Has handleDeleteInvoice:', src.includes('handleDeleteInvoice'));
console.log('Has CSV export button:', src.includes('Скачати CSV'));
console.log('Has Trash2 row button:', src.includes('Видалити фактуру'));
console.log('Has delete modal:', src.includes('Видалити фактуру?'));
