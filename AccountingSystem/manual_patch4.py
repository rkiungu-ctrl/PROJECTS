import sqlite3

conn = sqlite3.connect("accounting_system.db")
cursor = conn.cursor()

# Check if column already exists
cursor.execute("PRAGMA table_info(bank_transactions)")
columns = [col[1] for col in cursor.fetchall()]
if "cash_flow_type" not in columns:
    cursor.execute("ALTER TABLE bank_transactions ADD COLUMN cash_flow_type TEXT")
    print("✅ Column 'cash_flow_type' added successfully.")
else:
    print("ℹ️ Column 'cash_flow_type' already exists.")

conn.commit()
conn.close()


