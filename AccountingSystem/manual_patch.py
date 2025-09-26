import sqlite3

conn = sqlite3.connect("accounting_system.db")
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE journal_entries ADD COLUMN narration TEXT")
    print("✅ 'narration' column added successfully.")
except sqlite3.OperationalError as e:
    print("⚠️", e)

conn.commit()
conn.close()
