import sqlite3
conn = sqlite3.connect('C:/Projects/web dev/ALiSiO-Hotel-PMS/data/alisio.db')
c = conn.cursor()
c.execute("SELECT id, name, is_active FROM units WHERE property_id = (SELECT property_id FROM sites WHERE id = '20b5d7d00feb2a47237d8785f949bc1c')")
print("Units for site:", c.fetchall())
