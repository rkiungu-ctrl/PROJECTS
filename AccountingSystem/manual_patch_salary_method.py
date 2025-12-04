import sqlite3

# Patch script to add salary_processing_method column if it does not exist
def add_column_if_not_exists(db_path, table, column, col_type):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    # Check if column exists
    c.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in c.fetchall()]
    if column not in columns:
        c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        print(f"Added column: {column}")
    else:
        print(f"Column already exists: {column}")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    add_column_if_not_exists("AccountingSystem/accounting_system.db", "employees", "salary_processing_method", "TEXT")
