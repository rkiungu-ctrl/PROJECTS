#!/usr/bin/env python3
"""
Migrate employee deduction flag columns to normalized boolean integers (0/1).

This script will:
- Load all rows from the `employees` table
- For each row, interpret current values of `deduct_shif`, `deduct_nssf`, `deduct_housing_levy`
  using `utils.booleans.to_bool` and write back 1 (True) or 0 (False)
- Commit changes. Run in dry-run mode by default; use --apply to modify DB.

Notes:
- This script does NOT alter the table schema (ALTER COLUMN to NOT NULL/default) because
  SQLite ALTER TABLE limitations mean such operations are best performed with a
  controlled manual migration or using a database migration tool (Alembic).
- After running with --apply, your code can safely interpret these columns as booleans
  stored as integers (0/1). Optionally follow up with a schema migration if desired.

Usage:
  python migrate_employee_flags_to_boolean.py [--apply]

"""
import argparse
from database import SessionLocal
from models.employee import Employee
from utils.booleans import to_bool


def parse_args():
    p = argparse.ArgumentParser(description="Normalize employee deduction flags to boolean integers (0/1)")
    p.add_argument("--apply", action="store_true", help="Apply changes to DB (default: dry-run)")
    return p.parse_args()


def fmt_val(v):
    # return '1' or '0' as integer
    return 1 if to_bool(v, default=True) else 0


def main():
    args = parse_args()
    session = SessionLocal()
    rows = session.query(Employee).all()
    total = len(rows)
    print(f"Found {total} employees")
    changed = 0
    for i, e in enumerate(rows, start=1):
        cur_shif = getattr(e, 'deduct_shif', None)
        cur_nssf = getattr(e, 'deduct_nssf', None)
        cur_ahl = getattr(e, 'deduct_housing_levy', None)

        new_shif = fmt_val(cur_shif)
        new_nssf = fmt_val(cur_nssf)
        new_ahl = fmt_val(cur_ahl)

        diffs = []
        if (cur_shif is None and new_shif != 1) or (cur_shif is not None and int(cur_shif or 0) != new_shif):
            diffs.append(("deduct_shif", cur_shif, new_shif))
        if (cur_nssf is None and new_nssf != 1) or (cur_nssf is not None and int(cur_nssf or 0) != new_nssf):
            diffs.append(("deduct_nssf", cur_nssf, new_nssf))
        if (cur_ahl is None and new_ahl != 1) or (cur_ahl is not None and int(cur_ahl or 0) != new_ahl):
            diffs.append(("deduct_housing_levy", cur_ahl, new_ahl))

        if not diffs:
            print(f"[{i}/{total}] {e.staff_no} - OK")
            continue

        print(f"[{i}/{total}] {e.staff_no} - will change:")
        for col, old, new in diffs:
            print(f"    {col}: {old!r} -> {new}")

        if args.apply:
            try:
                if any(d[0] == 'deduct_shif' for d in diffs):
                    e.deduct_shif = new_shif
                if any(d[0] == 'deduct_nssf' for d in diffs):
                    e.deduct_nssf = new_nssf
                if any(d[0] == 'deduct_housing_levy' for d in diffs):
                    e.deduct_housing_levy = new_ahl
                session.add(e)
                session.commit()
                changed += 1
                print("    applied")
            except Exception as ex:
                session.rollback()
                print(f"    failed to apply: {ex}")
        else:
            print("    dry-run (use --apply to persist changes)")

    print(f"Done. {changed} rows updated (apply={'yes' if args.apply else 'no'})")


if __name__ == '__main__':
    main()
