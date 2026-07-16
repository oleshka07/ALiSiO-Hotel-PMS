const fs = require('fs');
const file = 'src/app/(dashboard)/documents/page.tsx';
let src = fs.readFileSync(file, 'utf8');

// 1. Add states
src = src.replace(
  /const \[invSearch,\s+setInvSearch\]\s+= useState\(''\);/,
  "const [invSearch,        setInvSearch]        = useState('');\n  const [invDateFrom,      setInvDateFrom]      = useState('');\n  const [invDateTo,        setInvDateTo]        = useState('');"
);

// 2. Update fetchAllInvoices signature
src = src.replace(
  /const fetchAllInvoices = useCallback\(async \(source: string, search: string\) => \{[\s\S]*?const params = new URLSearchParams\(\{ source, search \}\);/m,
  `const fetchAllInvoices = useCallback(async (source: string, search: string, from: string, to: string) => {
    setAllInvLoading(true);
    setAllInvError(null);
    try {
      const params = new URLSearchParams({ source, search });
      if (from) params.set('from', from);
      if (to) params.set('to', to);`
);

// 3. Update useEffect call
src = src.replace(
  /const t = setTimeout\(\(\) => fetchAllInvoices\(invSourceFilter, invSearch\), 300\);\s*return \(\) => clearTimeout\(t\);\s*\}\s*\}, \[activeTab, invSourceFilter, invSearch, fetchAllInvoices\]\);/m,
  `const t = setTimeout(() => fetchAllInvoices(invSourceFilter, invSearch, invDateFrom, invDateTo), 300);
      return () => clearTimeout(t);
    }
  }, [activeTab, invSourceFilter, invSearch, invDateFrom, invDateTo, fetchAllInvoices]);`
);

// 4. Update handleDeleteInvoice call
src = src.replace(
  /fetchAllInvoices\(invSourceFilter, invSearch\);/g,
  "fetchAllInvoices(invSourceFilter, invSearch, invDateFrom, invDateTo);"
);

// 5. Update export CSV link
src = src.replace(
  /href=\{`\/api\/invoices\/export\?source=\$\{invSourceFilter\}`\}/,
  "href={`/api/invoices/export?source=${invSourceFilter}${invDateFrom ? '&from='+invDateFrom : ''}${invDateTo ? '&to='+invDateTo : ''}`}"
);

// 6. Add UI Inputs
const uiPatch = `                </div>
                {/* Date Filters */}
                <input
                  type="date"
                  title="Від дати"
                  value={invDateFrom}
                  onChange={e => setInvDateFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border-primary)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                />
                <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                <input
                  type="date"
                  title="До дати"
                  value={invDateTo}
                  onChange={e => setInvDateTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border-primary)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                />
                {/* CSV Export button */}`;

src = src.replace(
  /                <\/div>\r?\n                \{\/\* CSV Export button \*\/\}/,
  uiPatch
);

fs.writeFileSync(file, src, 'utf8');
console.log('States added:', src.includes('invDateFrom'));
console.log('fetchAllInvoices sig:', src.includes('from: string, to: string'));
console.log('useEffect deps:', src.includes('invDateFrom, invDateTo, fetchAllInvoices'));
console.log('UI inputs added:', src.includes('type="date"'));
