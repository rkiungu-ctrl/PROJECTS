import sqlite3

# Connect to your database
conn = sqlite3.connect("accounting_system.db")
cursor = conn.cursor()

# Try to add the 'narration' column to journal_lines
try:
    cursor.execute("ALTER TABLE journal_lines ADD COLUMN narration TEXT")
    print("✅ 'narration' column added successfully.")
except sqlite3.OperationalError as e:
    print("⚠️", e)

conn.commit()
conn.close()
