$file = "d:\Antigraviti\ALiSiO PMS\src\app\(dashboard)\documents\page.tsx"
$lines = Get-Content $file -Encoding UTF8

# New invoices tab content (lines 497-628 replacement)
$newTabContent = @'
        {/* ════════════════════════════════════════════════════════
            TAB: INVOICES — All invoices with search + source filter
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'invoices' && (() => {
          // Source badge config
          const sourceConfig: Record<string, { label: string; color: string; bg: string }> = {
            airbnb:  { label: 'Airbnb',  color: '#e61e4d', bg: 'rgba(230,30,77,0.1)'   },
            booking: { label: 'Booking', color: '#003580', bg: 'rgba(0,53,128,0.1)'     },
            teya:    { label: 'Teya',    color: '#00a699', bg: 'rgba(0,166,153,0.1)'    },
            manual:  { label: 'Вручну',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
            pms:     { label: 'PMS',     color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
          };
          const sourcePills = [
            { id: 'all',     label: 'Усі'     },
            { id: 'airbnb',  label: 'Airbnb'  },
            { id: 'booking', label: 'Booking' },
            { id: 'teya',    label: 'Teya'    },
            { id: 'manual',  label: 'Вручну'  },
            { id: 'pms',     label: 'PMS'     },
          ] as const;
          return (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(79,110,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Receipt size={18} color="var(--accent-primary)" />
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Всього фактур</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{allInvoices.length}</div>
                </div>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(230,30,77,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Banknote size={18} color="#e61e4d" />
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Airbnb + Booking + Teya</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>
                    {allInvoices.filter(i => ['airbnb','booking','teya'].includes(i.source)).length}
                  </div>
                </div>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={18} color="#dc2626" />
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Storno / Refund</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>
                    {allInvoices.filter(i => i.is_credit_note).length}
                  </div>
                </div>
              </div>

              {/* Search + filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Пошук: ім'я, номер фактури, сума…"
                    value={invSearch}
                    onChange={e => setInvSearch(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: 32, paddingRight: invSearch ? 28 : 10,
                      paddingTop: 7, paddingBottom: 7,
                      border: '1.5px solid var(--border-primary)',
                      borderRadius: 8, fontSize: 13,
                      background: 'var(--surface)', color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  {invSearch && (
                    <button onClick={() => setInvSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, display: 'flex' }}>
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Source filter pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {sourcePills.map(pill => {
                  const active = invSourceFilter === pill.id;
                  const cfg = sourceConfig[pill.id as keyof typeof sourceConfig];
                  const color = cfg?.color || 'var(--accent-primary)';
                  return (
                    <button key={pill.id} onClick={() => setInvSourceFilter(pill.id as typeof invSourceFilter)} style={{ padding: '5px 14px', borderRadius: 20, border: active ? `2px solid ${color}` : '2px solid var(--border-primary)', background: active ? (cfg?.bg || 'rgba(79,110,247,0.1)') : 'transparent', color: active ? color : 'var(--text-secondary)', fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {pill.label}
                    </button>
                  );
                })}
                {allInvLoading && <RefreshCw size={14} className="spin" style={{ color: 'var(--text-tertiary)' }} />}
              </div>

              {/* Table */}
              {allInvError ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
                  <AlertCircle size={24} style={{ marginBottom: 8 }} /><div>{allInvError}</div>
                </div>
              ) : !allInvLoading && allInvoices.length === 0 ? (
                <div className="card" style={{ padding: 56, textAlign: 'center' }}>
                  <Receipt size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                    {invSearch || invSourceFilter !== 'all' ? 'Нічого не знайдено' : 'Фактур ще немає'}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                    {invSearch ? `За запитом «${invSearch}»` : 'Завантажте виписки у вкладці «Виписки»'}
                  </div>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Фактура №</th>
                        <th>Джерело</th>
                        <th>Покупець / Призначення</th>
                        <th>Сума</th>
                        <th>Дата</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allInvoices.map(inv => {
                        const srcCfg = sourceConfig[inv.source] || sourceConfig.manual;
                        const isCreditNote = !!inv.is_credit_note;
                        return (
                          <tr key={inv.id} style={isCreditNote ? { background: 'rgba(220,38,38,0.04)' } : undefined}>
                            <td>
                              <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: isCreditNote ? '#dc2626' : 'var(--accent-primary)' }}>
                                {inv.invoice_number}
                              </code>
                              {isCreditNote && <span style={{ marginLeft: 5, fontSize: 10, color: '#dc2626', fontWeight: 700 }}>STORNO</span>}
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: srcCfg.bg, color: srcCfg.color }}>
                                {srcCfg.label}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{inv.buyer_name || '—'}</div>
                              {(inv.custom_description || inv.unit_name) && (
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                                  {inv.custom_description || inv.unit_name}
                                </div>
                              )}
                            </td>
                            <td>
                              <span style={{ fontWeight: 700, fontSize: 14, color: isCreditNote ? '#dc2626' : undefined }}>
                                {formatAmount(inv.amount, inv.currency)}
                              </span>
                            </td>
                            <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={11} />{formatDate(inv.issued_at)}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button className="btn btn-sm btn-ghost btn-icon" title="PDF" onClick={() => downloadPdf(inv.id, inv.invoice_number)}>
                                  <FileDown size={14} />
                                </button>
                                <button className="btn btn-sm btn-ghost btn-icon" title="ISDOC" onClick={() => downloadIsdoc(inv.id, inv.invoice_number)}>
                                  <FileCode size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}

'@

$before = $lines[0..495]   # lines 1-496 (0-indexed: 0-495)
$after  = $lines[627..($lines.Count-1)]    # lines 628+ (0-indexed: 627+)

$newLines = $before + $newTabContent.Split("`n") + $after
$newLines | Set-Content $file -Encoding UTF8

Write-Host "Done. Total lines: $($newLines.Count)"
