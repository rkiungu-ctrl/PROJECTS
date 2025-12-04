#!/usr/bin/env python3
"""
Run a local preview request and inspect advance rows for a staff_no.
Usage:
  python preview_and_inspect.py TNL025 2025-01-01

This script runs entirely locally and prints JSON and DB rows to help debugging.
"""
import sys
import urllib.request
import json
import sqlite3
import os

staff_no = sys.argv[1] if len(sys.argv) > 1 else 'TNL025'
period = sys.argv[2] if len(sys.argv) > 2 else '2025-01-01'

url = f'http://localhost:8000/payrolls/preview?staff_no={staff_no}&period={period}'
print('Calling preview endpoint:', url)
try:
    with urllib.request.urlopen(url, timeout=10) as r:
        body = r.read().decode()
        try:
            data = json.loads(body)
            print('\nPreview JSON:')
            print(json.dumps(data, indent=2, default=str))
        except Exception:
            print('\nPreview RAW:')
            print(body)
except Exception as e:
    print('\nERROR calling preview endpoint:', repr(e))

# Inspect DB advances
dbpath = os.path.join(os.path.dirname(__file__), '..', 'accounting_system.db')
print('\nLooking for DB at', dbpath)
if not os.path.exists(dbpath):
    print('DB not found at expected path. Adjust dbpath in this script or run from AccountingSystem folder.')
    sys.exit(1)

conn = sqlite3.connect(dbpath)
cur = conn.cursor()
cur.execute('SELECT id, staff_no, name FROM employee WHERE staff_no = ?', (staff_no,))
emp = cur.fetchone()
print('\nEmployee row:', emp)
if not emp:
    print('Employee not found in DB; stopping.')
    sys.exit(1)
emp_id = emp[0]

# Look for candidate advance tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
candidates = [t for t in tables if 'adv' in t.lower() or 'loan' in t.lower()]
print('\nCandidate advance tables:', candidates)

for t in candidates:
    try:
        cur.execute(f"PRAGMA table_info({t})")
        cols = [c[1] for c in cur.fetchall()]
        try:
            cur.execute(f"SELECT * FROM {t} WHERE employee_id = ?", (emp_id,))
            rows = cur.fetchall()
        except Exception as e:
            rows = f'SELECT_FAILED: {e}'
        print('\nTable:', t)
        print('Cols:', cols)
        if isinstance(rows, list):
            print('Found', len(rows), 'rows')
            for r in rows:
                print(dict(zip(cols, r)))
        else:
            print(rows)
    except Exception as e:
        print('Error reading table', t, e)

conn.close()
