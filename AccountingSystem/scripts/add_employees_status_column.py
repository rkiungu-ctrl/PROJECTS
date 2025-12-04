#!/usr/bin/env python3
"""
Add a missing `status` column to the employees table if it's not present.
This script is safe to run multiple times: it checks PRAGMA table_info
and only runs ALTER TABLE if the column name is absent.

Usage:
  python scripts\add_employees_status_column.py

It will target the `accounting_system.db` file located in the repository folder
(next to this script).
"""
from pathlib import Path
import sqlite3
import sys

DB = Path(__file__).resolve().parent.parent / "accounting_system.db"
if not DB.exists():
    print(f"ERROR: DB file not found at {DB}")
    sys.exit(2)

con = sqlite3.connect(str(DB))
cur = con.cursor()

try:
    cur.execute("PRAGMA table_info(employees)")
    cols = [r[1] for r in cur.fetchall()]
    if "status" in cols:
        print("Column 'status' already exists on employees table. Nothing to do.")
    else:
        print("Adding column 'status' to employees table (default 'Active')...")
        cur.execute("ALTER TABLE employees ADD COLUMN status TEXT DEFAULT 'Active'")
        con.commit()
        print("Done: 'status' column added.")
except Exception as e:
    print("Failed to add 'status' column:", e)
    sys.exit(1)
finally:
    con.close()
