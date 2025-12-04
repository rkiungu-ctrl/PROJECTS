#!/usr/bin/env python3
"""
Safe SQLite migration to enforce NOT NULL + DEFAULT 1 on employee deduction flags.

What it does:
 - Makes a timestamped backup of the DB file.
 - Normalizes existing values for `deduct_shif`, `deduct_nssf`, `deduct_housing_levy` to 0/1
   (maps common string falses to 0, everything else to 1; NULL -> 1).
 - Recreates the `employees` table with the three columns defined as
   INTEGER NOT NULL DEFAULT 1 using a safe copy/drop/rename approach.
 - Recreates any user-defined indexes on the table.

Usage:
  python migrate_employees_flags_schema.py         # dry-run, prints actions
  python migrate_employees_flags_schema.py --apply # perform the migration

Notes:
 - This script is written for SQLite (the project's DB). It is idempotent: if the
   table already has the desired schema it will report and exit without destructive
   changes. Still, always run a backup and test on a copy first.
 - If you are using Alembic and prefer a migration there, I can produce one too.
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
import sys
import json


def get_db_path() -> Path:
    # db is at ../accounting_system.db relative to this script
    here = Path(__file__).resolve().parent
    db = here.parent / "accounting_system.db"
    if not db.exists():
        raise FileNotFoundError(f"Database file not found at {db}")
    return db


def backup_db(db_path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = db_path.with_suffix(f".bak.{ts}")
    shutil.copy2(db_path, backup)
    return backup


def normalize_flag_values(conn: sqlite3.Connection, dry_run: bool) -> None:
    """Normalize flag-like values to 0/1 in-place.

    Rules (best-effort):
     - lower(trim(value)) in ('0','false','no','off') -> 0
     - NULL -> 1
     - otherwise -> 1
    """
    cur = conn.cursor()

    updates = []
    for col in ("deduct_shif", "deduct_nssf", "deduct_housing_levy"):
        sql = f"""
        UPDATE employees
        SET {col} = CASE
          WHEN {col} IS NULL THEN 1
          WHEN lower(trim({col})) IN ('0','false','no','off') THEN 0
          WHEN trim({col}) = '' THEN 1
          ELSE 1
        END
        WHERE {col} IS NULL OR lower(trim({col})) IN ('0','false','no','off') OR trim({col}) = '' OR typeof({col}) = 'text'
        """
        updates.append((col, sql))

    # Print plan
    print("Normalization plan: will coerce values for columns:")
    for col, sql in updates:
        print(f" - {col}")

    if dry_run:
        print("Dry-run mode: not applying normalization updates.")
        return

    for col, sql in updates:
        cur.execute(sql)
    conn.commit()
    print("Normalization applied.")


def table_info(conn: sqlite3.Connection, table: str) -> list[dict]:
    cur = conn.execute(f"PRAGMA table_info('{table}')")
    cols = [dict(zip([c[0] for c in cur.description], row)) for row in cur.fetchall()]
    return cols


def get_indexes(conn: sqlite3.Connection, table: str) -> list[str]:
    cur = conn.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=?", (table,))
    statements = []
    for name, sql in cur.fetchall():
        if not sql:
            continue  # sqlite_internal index (autoindex)
        statements.append(sql)
    return statements


def has_desired_column_constraints(cols_info: list[dict]) -> bool:
    # Check if our three columns are NOT NULL and have DEFAULT 1
    want = {
        "deduct_shif": (1, '1'),
        "deduct_nssf": (1, '1'),
        "deduct_housing_levy": (1, '1'),
    }
    for col in cols_info:
        name = col['name']
        if name in want:
            notnull, dflt = want[name]
            if int(col['notnull']) != notnull:
                return False
            # Compare default textually; pragma returns default as string or None
            cur_dflt = col.get('dflt_value')
            if cur_dflt is None:
                return False
            # Normalize default value punctuation (could be '1' or 1)
            if str(cur_dflt).strip().strip("'\"") != dflt:
                return False
    return True


def recreate_table_with_constraints(conn: sqlite3.Connection, dry_run: bool) -> None:
    cur = conn.cursor()
    cols = table_info(conn, 'employees')
    if not cols:
        raise RuntimeError("employees table not found or has no columns")

    if has_desired_column_constraints(cols):
        print("employees table already has desired NOT NULL + DEFAULT 1 constraints for target columns. Nothing to do.")
        return

    # Build CREATE TABLE statement for employees_new
    col_defs = []
    pk_cols = []
    for c in cols:
        cname = c['name']
        # use declared type if present, else fallback to TEXT
        ctype = c['type'] if c['type'] else 'TEXT'
        notnull = bool(c['notnull'])
        dflt = c['dflt_value']
        pk = bool(c['pk'])

        # If this is one of our 3 target columns, enforce INTEGER NOT NULL DEFAULT 1
        if cname in ('deduct_shif', 'deduct_nssf', 'deduct_housing_levy'):
            cdef = f"{cname} INTEGER NOT NULL DEFAULT 1"
        else:
            part = f"{cname} {ctype}"
            if notnull:
                part += " NOT NULL"
            if dflt is not None:
                part += f" DEFAULT {dflt}"
            cdef = part

        col_defs.append(cdef)
        if pk:
            pk_cols.append(cname)

    # handle PK
    if pk_cols and len(pk_cols) > 1:
        pk_clause = f", PRIMARY KEY ({', '.join(pk_cols)})"
    else:
        pk_clause = ''

    create_sql = f"CREATE TABLE employees_new ({', '.join(col_defs)}{pk_clause});"

    print("Will create new table with statement:")
    print(create_sql)

    idxs = get_indexes(conn, 'employees')
    if idxs:
        print("Will recreate the following indexes after table swap:")
        for s in idxs:
            print(" - ", s)

    if dry_run:
        print("Dry-run mode: not executing CREATE/INSERT/DROP/RENAME.")
        return

    # Transactional swap
    cur.execute('PRAGMA foreign_keys = OFF;')
    cur.execute(create_sql)

    # copy data (use explicit column list to avoid surprises)
    col_names = [c['name'] for c in cols]
    cols_csv = ', '.join(col_names)
    insert_sql = f"INSERT INTO employees_new ({cols_csv}) SELECT {cols_csv} FROM employees;"
    cur.execute(insert_sql)

    # swap tables
    cur.execute("DROP TABLE employees;")
    cur.execute("ALTER TABLE employees_new RENAME TO employees;")

    # recreate indexes
    for s in idxs:
        try:
            cur.execute(s)
        except Exception as e:
            print(f"Warning: failed to create index: {s}\n  {e}")

    cur.execute('PRAGMA foreign_keys = ON;')
    conn.commit()
    print("Table recreation complete. employees table updated.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Perform the migration. Default is dry-run.')
    args = parser.parse_args(argv)

    db_path = get_db_path()
    print(f"Using DB: {db_path}")

    try:
        backup = backup_db(db_path)
        print(f"Backup saved to: {backup}")
    except Exception as e:
        print(f"Failed to create backup: {e}")
        return 2

    dry_run = not args.apply

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        print("=== Normalizing data ===")
        normalize_flag_values(conn, dry_run=dry_run)

        print("=== Will recreate employees table to enforce NOT NULL + DEFAULT 1 ===")
        recreate_table_with_constraints(conn, dry_run=dry_run)

        if dry_run:
            print("Dry-run finished. To apply changes run with --apply")
        else:
            print("Migration applied successfully.")
        return 0
    except Exception as e:
        print(f"Migration failed: {e}")
        return 1
    finally:
        conn.close()


if __name__ == '__main__':
    raise SystemExit(main())
