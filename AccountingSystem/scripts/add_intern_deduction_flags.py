import sqlite3

DB = r"C:\PROJECTS\AccountingSystem\accounting_system.db"


def add_column_if_missing(cur, table, col, sql_type, default=None):
    cur.execute(f"PRAGMA table_info({table})")
    cols = [r[1] for r in cur.fetchall()]
    if col not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {sql_type}")
        if default is not None:
            cur.execute(f"UPDATE {table} SET {col} = ?", (default,))


with sqlite3.connect(DB) as con:
    cur = con.cursor()
    add_column_if_missing(cur, "employees", "deduct_paye", "INTEGER NOT NULL DEFAULT 1", default=1)
    add_column_if_missing(cur, "employees", "deduct_nssf", "INTEGER NOT NULL DEFAULT 1", default=1)
    add_column_if_missing(cur, "employees", "deduct_shif", "INTEGER NOT NULL DEFAULT 1", default=1)
    # keep compatibility with existing name if using deduct_housing_levy
    add_column_if_missing(cur, "employees", "deduct_housing_levy", "INTEGER NOT NULL DEFAULT 1", default=1)

    # Default interns to no deductions
    cur.execute(r"""
        UPDATE employees
           SET deduct_paye = 0,
               deduct_nssf = 0,
               deduct_shif = 0,
               deduct_housing_levy = 0
         WHERE LOWER(COALESCE(employment_type, '')) = 'intern'
           AND (COALESCE(deduct_paye,1) = 1 OR COALESCE(deduct_nssf,1) = 1 OR COALESCE(deduct_shif,1) = 1 OR COALESCE(deduct_housing_levy,1) = 1)
    """)
    con.commit()

print("Migration done. Columns added (if missing) and interns backfilled to be exempt.")
