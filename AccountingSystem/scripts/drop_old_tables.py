"""Drop legacy loan tables if present.

This script drops a small set of legacy tables (employee_loans, employee_advances)
from the sqlite DB. It first lists tables, prints which will be dropped, then
drops them and reports the result.

Run via the project's venv python. Always ensure you have a backup before
running (the caller should create one). This script performs DROP TABLE IF EXISTS
so it's safe to re-run.
"""
import sqlite3
import os
import sys
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
DB = os.path.join(ROOT, 'accounting_system.db')

if len(sys.argv) > 1:
    DB = sys.argv[1]

if not os.path.isfile(DB):
    print('DB not found:', DB)
    sys.exit(1)

conn = sqlite3.connect(DB)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print('Found tables:')
for t in tables:
    print('  ', t)

legacy = ['employee_loans', 'employee_advances']
to_drop = [t for t in legacy if t in tables]

if not to_drop:
    print('No legacy tables found to drop.')
    conn.close()
    sys.exit(0)

print('\nTables to drop:')
for t in to_drop:
    print('  ', t)

for t in to_drop:
    try:
        cur.execute(f"DROP TABLE IF EXISTS {t}")
        print('Dropped', t)
    except Exception as e:
        print('Failed to drop', t, e)

conn.commit()
conn.close()
print('\nDone.')
