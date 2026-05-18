import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

filepath = 'src/modules/bookings/ui/BookingV2.tsx'
with open(filepath, 'rb') as f:
    raw = f.read()

content = raw.decode('utf-8', errors='surrogatepass')
print(f"File size: {len(raw)} bytes, chars: {len(content)}")

# === Patch 1: auto-select unit when bundle applied_listings has 1 item ===
old1 = "        // If it's a package, automatically select the included services\r\n        if (data.discount_type === 'package' && data.bundle?.included_services) {\r\n          const newServices = new Set(selectedServiceIds);\r\n          data.bundle.included_services.forEach((inc: any) => {\r\n            if (inc.free) newServices.add(inc.service_id);\r\n          });\r\n          setSelectedServiceIds(newServices);\r\n        }\r\n      } else {"
new1 = "        // If it's a package, automatically select the included services\r\n        if (data.discount_type === 'package' && data.bundle?.included_services) {\r\n          const newServices = new Set(selectedServiceIds);\r\n          data.bundle.included_services.forEach((inc: any) => {\r\n            if (inc.free) newServices.add(inc.service_id);\r\n          });\r\n          setSelectedServiceIds(newServices);\r\n        }\r\n        // If bundle is restricted to exactly 1 unit \u2014 auto-select it and skip step 2\r\n        if (data.discount_type === 'package' && data.bundle?.applied_listings?.length === 1) {\r\n          setSelectedUnitId(data.bundle.applied_listings[0]);\r\n        }\r\n      } else {"

if old1 in content:
    content = content.replace(old1, new1, 1)
    print("Patch 1 (auto-select unit): APPLIED")
else:
    print("Patch 1: NOT FOUND, trying LF...")
    old1_lf = old1.replace('\r\n', '\n')
    if old1_lf in content:
        content = content.replace(old1_lf, new1.replace('\r\n', '\n'), 1)
        print("Patch 1: APPLIED (LF)")
    else:
        print("Patch 1: STILL NOT FOUND")

# === Patch 2: set showPromo=true when bundle URL param ===
old2 = "      const urlBundle = params.get('bundle') || params.get('bundleId');\r\n      if (urlBundle) {\r\n        setPromoCode(urlBundle);\r\n        setIsHiddenBundle(true);\r\n      }"
new2 = "      const urlBundle = params.get('bundle') || params.get('bundleId');\r\n      if (urlBundle) {\r\n        setPromoCode(urlBundle);\r\n        setIsHiddenBundle(true);\r\n        setShowPromo(true);\r\n      }"

if old2 in content:
    content = content.replace(old2, new2, 1)
    print("Patch 2 (showPromo=true): APPLIED")
else:
    old2_lf = old2.replace('\r\n', '\n')
    if old2_lf in content:
        content = content.replace(old2_lf, new2.replace('\r\n', '\n'), 1)
        print("Patch 2: APPLIED (LF)")
    else:
        print("Patch 2: NOT FOUND")

# === Patch 3: refactor promo section UI ===
start_marker = '          <div className="v3-promo-section">'
start_idx = content.find(start_marker)
step2_idx = content.find('STEP 2: HOUSE LIST', start_idx)
if start_idx == -1 or step2_idx == -1:
    print(f"Patch 3: markers not found start={start_idx} step2={step2_idx}")
else:
    segment = content[start_idx:step2_idx]
    last_div_rel = segment.rfind('</div>')
    end_idx = start_idx + last_div_rel + len('</div>')
    print(f"Patch 3: replacing chars {start_idx}-{end_idx}")

    new_block = (
        '          <div className="v3-promo-section">\r\n'
        '            {!promoApplied && (\r\n'
        '              <button className="v3-promo-toggle" onClick={() => setShowPromo(!showPromo)}>\r\n'
        "                {showPromo ? '\u2212' : '+'} {t.promoCode} / {t.certificateCode}\r\n"
        '              </button>\r\n'
        '            )}\r\n'
        '            {promoApplied && (\r\n'
        '              <div className="v3-promo-success">\r\n'
        "                {'\U0001f3f7\ufe0f'} {promoApplied.code}: {promoApplied.discount_type === 'percentage' ? `-${promoApplied.discount_value}%` : promoApplied.discount_type === 'package' ? `\u041f\u0430\u043a\u0435\u0442 \u2014 ${promoApplied.description || promoApplied.code}` : `-${promoApplied.discount_value} K\u010d`}\r\n"
        "                {invalidNightsMsg && <div style={{ marginTop: 6, color: '#ef4444', fontWeight: 600, fontSize: 13 }}>\u26a0\ufe0f {invalidNightsMsg}</div>}\r\n"
        '              </div>\r\n'
        '            )}\r\n'
        '            {!promoApplied && showPromo && (\r\n'
        '              <div className="v3-promo-field">\r\n'
        '                <input\r\n'
        '                  className="v3-field-input"\r\n'
        '                  placeholder={t.promoCode}\r\n'
        '                  value={promoCode}\r\n'
        "                  onChange={e => { setPromoCode(e.target.value); setPromoError(''); }}\r\n"
        "                  onKeyDown={e => e.key === 'Enter' && !applyingPromo && handleApplyPromo()}\r\n"
        '                />\r\n'
        '                <button\r\n'
        '                  className="v3-promo-apply"\r\n'
        '                  onClick={handleApplyPromo}\r\n'
        '                  disabled={applyingPromo || !promoCode.trim()}\r\n'
        '                >\r\n'
        "                  {applyingPromo ? '...' : t.apply}\r\n"
        '                </button>\r\n'
        '              </div>\r\n'
        '            )}\r\n'
        '              {promoError && <div className="v3-promo-error">{promoError}</div>}\r\n'
        "              {!promoApplied && invalidNightsMsg && <div className=\"v3-promo-error\" style={{ marginTop: 8, color: '#ef4444', fontWeight: 600 }}>\u26a0\ufe0f {invalidNightsMsg}</div>}\r\n"
        '          </div>'
    )

    content = content[:start_idx] + new_block + content[end_idx:]
    print(f"Patch 3: APPLIED, new content length: {len(content)}")

with open(filepath, 'wb') as f:
    f.write(content.encode('utf-8', errors='surrogatepass'))

print("\nAll patches done, file saved.")
