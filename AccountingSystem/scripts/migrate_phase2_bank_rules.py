import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "accounting_system.db"


def column_exists(con: sqlite3.Connection, table: str, column: str) -> bool:
    cur = con.execute(f"PRAGMA table_info({table});")
    for row in cur.fetchall():
        # row: cid, name, type, notnull, dflt_value, pk
        if str(row[1]).lower() == column.lower():
            return True
    return False


def add_column_if_missing(con: sqlite3.Connection, table: str, column_def: str):
    # column_def like: "is_categorized BOOLEAN DEFAULT FALSE"
    column_name = column_def.split()[0]
    if not column_exists(con, table, column_name):
        con.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")


def main():
    con = sqlite3.connect(str(DB_PATH))
    try:
        # bank_rules additions
        add_column_if_missing(con, "bank_rules", "payee_type VARCHAR(50)")
        add_column_if_missing(con, "bank_rules", "payee_id INTEGER")
        add_column_if_missing(con, "bank_rules", "auto_create_payment_receipt BOOLEAN DEFAULT 1")

        # bank_transactions additions
        add_column_if_missing(con, "bank_transactions", "is_categorized BOOLEAN DEFAULT 0")
        add_column_if_missing(con, "bank_transactions", "payee_type VARCHAR(50)")
        add_column_if_missing(con, "bank_transactions", "payee_id INTEGER")
        add_column_if_missing(con, "bank_transactions", "payee_name VARCHAR(255)")

        con.commit()
        print("Phase 2 migration applied successfully.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
