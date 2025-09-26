import sqlite3

conn = sqlite3.connect("accounting_system.db")
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE journal_lines ADD COLUMN account_code TEXT")
    print("✅ 'account_code' column added successfully.")
except sqlite3.OperationalError as e:
    print("⚠️", e)

conn.commit()
conn.close()
