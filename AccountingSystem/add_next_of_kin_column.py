import sqlite3

conn = sqlite3.connect("accounting_system.db")
cursor = conn.cursor()

# Add next_of_kin column if it doesn't exist
cursor.execute("PRAGMA table_info(employees)")
columns = [row[1] for row in cursor.fetchall()]
if "next_of_kin" not in columns:
    cursor.execute("ALTER TABLE employees ADD COLUMN next_of_kin TEXT")
    print("Added next_of_kin column.")
else:
    print("next_of_kin column already exists.")

conn.commit()
conn.close()