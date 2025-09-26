import sqlite3

conn = sqlite3.connect("accounting_system.db")
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE payrolls ADD COLUMN ahl_employer REAL DEFAULT 0;")
    print("✅ Added column: ahl_employer")
except sqlite3.OperationalError:
    print("⚠️ Column 'ahl_employer' already exists.")

try:
    cursor.execute("ALTER TABLE payrolls ADD COLUMN nssf_employer REAL DEFAULT 0;")
    print("✅ Added column: nssf_employer")
except sqlite3.OperationalError:
    print("⚠️ Column 'nssf_employer' already exists.")

try:
    cursor.execute("ALTER TABLE payrolls ADD COLUMN nita_employer REAL DEFAULT 0;")
    print("✅ Added column: nita_employer")
except sqlite3.OperationalError:
    print("⚠️ Column 'nita_employer' already exists.")

conn.commit()
conn.close()
print("✅ Update script completed.")
