const fs = require('fs');
const file = 'src/app/(dashboard)/documents/page.tsx';
let src = fs.readFileSync(file, 'utf8');

// The marker: closing of the relative input wrapper, then closing of the flex row
// We look for the unique pattern of two consecutive closing divs in the search area
const from = '                </div>\r\n              </div>\r\n\r\n              {/* Source filter pills */}';
const to   = `                </div>
                {/* CSV Export button */}
                <a
                  href={\`/api/invoices/export?source=\${invSourceFilter}\`}
                  download
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border-primary)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <Download size={13} /> Скачати CSV
                </a>
              </div>

              {/* Source filter pills */}`;

if (!src.includes(from)) {
  console.error('MARKER NOT FOUND');
  process.exit(1);
}

src = src.replace(from, to);
fs.writeFileSync(file, src, 'utf8');
console.log('CSV button added:', src.includes('Скачати CSV'));
