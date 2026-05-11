import sqlite3
import json

conn = sqlite3.connect('C:/Projects/web dev/ALiSiO-Hotel-PMS/data/alisio.db')
c = conn.cursor()
c.execute("SELECT id, name, applied_listings FROM voucher_bundles WHERE promo_code = 'VIP349'")
res = c.fetchone()
if res:
    print(f'ID: {res[0]}, Name: {res[1]}')
    listings = res[2]
    print(f'Applied Listings raw: {listings}')
    try:
        parsed = json.loads(listings)
        print(f'Parsed: {parsed}, Type: {type(parsed)}')
        if len(parsed) > 0:
            print(f'First item type: {type(parsed[0])}')
    except Exception as e:
        print(e)
else:
    print('Not found')
