import sqlite3, os

dbpath = os.path.join(r"c:\PROJECTS\AccountingSystem", "accounting_system.db")
print("DB:", dbpath, 'exists=', os.path.exists(dbpath))
if not os.path.exists(dbpath):
    raise SystemExit('DB not found')
conn = sqlite3.connect(dbpath)
cur = conn.cursor()
staff_no = 'TNL025'
cur.execute("SELECT id, staff_no, name FROM employee WHERE staff_no = ?", (staff_no,))
emp = cur.fetchone()
print('EMP:', emp)
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print('TABLES_COUNT:', len(tables))

candidates = [t for t in tables if 'adv' in t.lower() or 'loan' in t.lower() or 'advance' in t.lower()]
print('CANDIDATE_ADV_TABLES:', candidates)

if emp:
    emp_id = emp[0]
    for t in candidates:
        try:
            cur.execute(f"PRAGMA table_info({t})")
            cols = [c[1] for c in cur.fetchall()]
            try:
                cur.execute(f"SELECT * FROM {t} WHERE employee_id = ?", (emp_id,))
                rows = cur.fetchall()
            except Exception as e:
                rows = ('SELECT_FAILED', str(e))
            print('\nTABLE', t)
            print('COLS:', cols)
            print('ROWS_COUNT:', len(rows) if isinstance(rows, list) else rows)
            if isinstance(rows, list) and rows:
                # print first row with column mapping
                print('FIRST_ROW:', dict(zip(cols, rows[0])))
        except Exception as e:
            print('ERR reading table', t, e)
else:
    print('No employee with that staff_no')
conn.close()
