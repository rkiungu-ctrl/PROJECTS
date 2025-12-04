import sqlite3
import sys

DB = r"c:\PROJECTS\AccountingSystem\accounting_system.db"
SQL_FILE = r"c:\PROJECTS\AccountingSystem\migrations\20251031_add_loan_repayment_paid_columns.sql"

print('DB:', DB)
print('SQL:', SQL_FILE)

try:
    with open(SQL_FILE, 'r', encoding='utf-8') as f:
        sql = f.read()
except Exception as e:
    print('Failed to read SQL file:', e)
    sys.exit(2)

try:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.executescript(sql)
    conn.commit()
    print('Migration executed successfully')
except Exception as e:
    print('Migration failed:', e)
    sys.exit(3)
finally:
    conn.close()
