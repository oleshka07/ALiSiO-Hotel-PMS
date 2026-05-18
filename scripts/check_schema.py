import sqlite3
conn = sqlite3.connect('C:/Projects/web dev/ALiSiO-Hotel-PMS/data/alisio.db')
c = conn.cursor()
c.execute("PRAGMA table_info(properties)")
print("Properties:", c.fetchall())
c.execute("PRAGMA table_info(widget_sites)")
print("Widget Sites:", c.fetchall())
