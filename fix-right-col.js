const fs = require('fs');
const file = 'src/app/(dashboard)/documents/page.tsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');

// Find start and end of the right column block
// Start: line containing '/* Right — Variabilní + Odběratel box */'
// End: line containing '</div>' that closes the outer right div (after the Odběratel sub-box)
let startIdx = -1, endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Right') && lines[i].includes('Odběratel box')) startIdx = i;
  if (startIdx > 0 && i > startIdx + 5 && lines[i].includes('</div>') && lines[i+1] && lines[i+1].trim() === '</div>') {
    // The pattern we want: closing the right col div, then closing the grid div
    endIdx = i + 1;
    break;
  }
}
console.log('Block found:', startIdx + 1, '..', endIdx + 1);

const newBlock = `                  {/* Right — Variabilní + Odběratel box */}
                  <div style={{ padding: '8px 10px', fontSize: 11 }}>
                    {/* Variabilní / Konstantní / Objednávka — same label:value pattern as left */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'baseline' }}>
                      <span style={{ color: '#888', fontSize: 9, minWidth: 108, flexShrink: 0 }}>Variabilní symbol:</span>
                      <span style={{ color: '#999', fontStyle: 'italic', fontSize: 10 }}>automaticky</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'baseline' }}>
                      <span style={{ color: '#888', fontSize: 9, minWidth: 108, flexShrink: 0 }}>Konstantní symbol:</span>
                      <span style={{ fontSize: 11 }}>0308</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'baseline' }}>
                      <span style={{ color: '#888', fontSize: 9, minWidth: 108, flexShrink: 0 }}>Objednávka č.:</span>
                      <span style={{ color: '#888', fontSize: 10 }}>ze dne:</span>
                    </div>

                    {/* Odběratel sub-box — mirrors Dodavatel structure */}
                    <div style={{ border: '0.5px solid #aaa', padding: '6px 8px' }}>
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>
                        Odběratel: <span style={{ color: '#4f6ef7' }}>(необов&apos;язково)</span>
                      </div>

                      {/* Company name — bold 12pt like "Kemp Carlsbad s.r.o." on the left */}
                      <input type="text" value={customForm.buyerName}
                        onChange={e => setCustomForm(f => ({ ...f, buyerName: e.target.value, showBuyer: !!e.target.value }))}
                        placeholder="Назва компанії або ПІБ..."
                        style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px dashed #4f6ef7', background: 'transparent', fontSize: 12, fontWeight: 700, padding: '1px 0', marginBottom: 5, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit' }}
                      />

                      {/* Address */}
                      <input type="text" value={customForm.buyerAddress}
                        onChange={e => setCustomForm(f => ({ ...f, buyerAddress: e.target.value }))}
                        placeholder="Вулиця, будинок"
                        style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', marginBottom: 4, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', display: 'block' }}
                      />

                      {/* PSČ / City */}
                      <input type="text" value={customForm.buyerCity}
                        onChange={e => setCustomForm(f => ({ ...f, buyerCity: e.target.value }))}
                        placeholder="PSČ Місто"
                        style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', marginBottom: 6, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', display: 'block' }}
                      />

                      {/* IČO — inline label:input like left side */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                        <span style={{ color: '#1565c0', fontSize: 9, minWidth: 24, flexShrink: 0 }}>IČO:</span>
                        <input type="text" value={customForm.buyerIco}
                          onChange={e => setCustomForm(f => ({ ...f, buyerIco: e.target.value }))}
                          placeholder="12345678"
                          style={{ flex: 1, border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: 0, outline: 'none', color: '#1565c0', fontFamily: 'inherit' }}
                        />
                      </div>

                      {/* DIČ — inline label:input */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ color: '#1565c0', fontSize: 9, minWidth: 24, flexShrink: 0 }}>DIČ:</span>
                        <input type="text" value={customForm.buyerDic}
                          onChange={e => setCustomForm(f => ({ ...f, buyerDic: e.target.value }))}
                          placeholder="CZ12345678"
                          style={{ flex: 1, border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: 0, outline: 'none', color: '#1565c0', fontFamily: 'inherit' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>`;

const before = lines.slice(0, startIdx);
const after  = lines.slice(endIdx + 1);
const result = [...before, ...newBlock.split('\n'), ...after].join('\n');
fs.writeFileSync(file, result, 'utf8');

const check = result.split('\n');
console.log('Done. Total lines:', check.length);
console.log('New block start:', check[startIdx].substring(0, 70));
