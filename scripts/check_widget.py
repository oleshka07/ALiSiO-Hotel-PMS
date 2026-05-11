import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
with open('src/modules/bookings/ui/BookingV2.tsx', 'rb') as f:
    content = f.read().decode('utf-8', errors='surrogatepass')

checks = [
    ('urlBundle param', 'urlBundle'),
    ('isHiddenBundle state', 'isHiddenBundle'),
    ('auto-select unit from applied_listings', 'applied_listings'),
    ('invalidNightsMsg', 'invalidNightsMsg'),
    ('skip step 2 single unit', 'units?.length === 1'),
    ('resolvedSiteId', 'resolvedSiteId'),
    ('setShowPromo on bundle load', 'setShowPromo(true)'),
    ('promo banner when applied', 'promoApplied &&'),
]
for name, kw in checks:
    found = kw in content
    status = 'OK    ' if found else 'MISSING'
    print(f'  {status} | {name}')
