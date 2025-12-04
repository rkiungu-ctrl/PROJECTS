import sqlite3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'accounting_system.db'
print('DB path:', p)
conn = sqlite3.connect(str(p))
c = conn.cursor()
try:
    c.execute('ALTER TABLE increments ADD COLUMN end_date DATE;')
    conn.commit()
    print('ALTER_OK')
except Exception as e:
    print('ERROR', e)
finally:
    conn.close()
