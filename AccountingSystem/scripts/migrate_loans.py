"""Safe migration script to consolidate legacy loan/advance tables into loan_advances.

Usage:
  python scripts/migrate_loans.py --dry-run
  python scripts/migrate_loans.py --apply

Dry-run prints a CSV summary of candidate rows and counts. --apply will insert
missing rows into `loan_advances` while preserving existing rows by reference_no.

This script is intentionally conservative: it will not update existing canonical
rows, only insert missing ones. Always backup your DB before running with --apply.
"""
import argparse
import csv
import sqlite3
import os
from typing import List

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
DB_PATH = os.path.join(ROOT, 'accounting_system.db')

from utils.loan_mapper import map_employee_loans_row_to_loan_advances, map_employee_advances_row_to_loan_advances


def get_rows(conn: sqlite3.Connection, table: str) -> List[sqlite3.Row]:
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT * FROM {table}")
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        return rows
    except Exception as e:
        print(f"Skipping {table}: {e}")
        return []


def exists_in_loan_advances(conn: sqlite3.Connection, reference_no: str) -> bool:
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM loan_advances WHERE reference_no = ? LIMIT 1", (reference_no,))
    return cur.fetchone() is not None


def insert_loan_advances(conn: sqlite3.Connection, loan_row: dict, employee_id: int):
    cur = conn.cursor()
    cols = []
    vals = []
    # Only write columns we know exist — this script assumes canonical schema has these cols
    for k in ('employee_id','loan_type','reference_no','principal_amount','date_issued','interest_rate','repayment_period','installment_amount','deduction_method','balance_outstanding','amount_repaid','status'):
        if k == 'employee_id':
            cols.append(k)
            vals.append(employee_id)
            continue
        v = loan_row.get(k)
        # SQLite needs ISO date string for date columns
        if k == 'date_issued' and hasattr(v, 'isoformat'):
            v = v.isoformat()
        cols.append(k)
        vals.append(v)
    placeholders = ','.join(['?'] * len(cols))
    cur.execute(f"INSERT INTO loan_advances ({','.join(cols)}) VALUES ({placeholders})", vals)


def dry_run(conn: sqlite3.Connection):
    out_rows = []
    # from employee_loans
    el_rows = get_rows(conn, 'employee_loans')
    for r in el_rows:
        ref = r.get('reference_no') or r.get('reference')
        if not ref:
            continue
        mapped = map_employee_loans_row_to_loan_advances(r)
        present = exists_in_loan_advances(conn, mapped.get('reference_no'))
        out_rows.append({'source_table': 'employee_loans', 'reference_no': mapped.get('reference_no'), 'employee_id': r.get('employee_id'), 'present_in_canonical': present})

    # from employee_advances
    ea_rows = get_rows(conn, 'employee_advances')
    for r in ea_rows:
        # map advance row
        mapped = map_employee_advances_row_to_loan_advances(r)
        ref = mapped.get('reference_no') or f"ADV-{r.get('id')}-{r.get('employee_id')}"
        present = exists_in_loan_advances(conn, ref)
        out_rows.append({'source_table': 'employee_advances', 'reference_no': ref, 'employee_id': r.get('employee_id'), 'present_in_canonical': present})

    # write CSV summary
    csv_path = os.path.join(ROOT, 'migrate_loans_dryrun.csv')
    with open(csv_path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=['source_table','reference_no','employee_id','present_in_canonical'])
        w.writeheader()
        for r in out_rows:
            w.writerow(r)

    print(f"Dry-run complete. Summary written to {csv_path}. Rows considered: {len(out_rows)}")


def apply_migration(conn: sqlite3.Connection):
    cur = conn.cursor()
    inserted = 0
    # employee_loans -> loan_advances
    el_rows = get_rows(conn, 'employee_loans')
    for r in el_rows:
        mapped = map_employee_loans_row_to_loan_advances(r)
        ref = mapped.get('reference_no')
        if not ref:
            continue
        if exists_in_loan_advances(conn, ref):
            continue
        try:
            insert_loan_advances(conn, mapped, r.get('employee_id'))
            inserted += 1
        except Exception as e:
            print('Insert failed for', ref, e)

    # employee_advances -> loan_advances
    ea_rows = get_rows(conn, 'employee_advances')
    for r in ea_rows:
        mapped = map_employee_advances_row_to_loan_advances(r)
        # ensure a reference exists
        if not mapped.get('reference_no'):
            mapped['reference_no'] = f"ADV-{r.get('id')}-{r.get('employee_id')}"
        ref = mapped.get('reference_no')
        if exists_in_loan_advances(conn, ref):
            continue
        try:
            insert_loan_advances(conn, mapped, r.get('employee_id'))
            inserted += 1
        except Exception as e:
            print('Insert failed for', ref, e)

    conn.commit()
    print(f"Migration applied. Inserted {inserted} rows into loan_advances.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Apply the migration (writes to DB).')
    parser.add_argument('--db', default=DB_PATH, help='Path to sqlite DB file')
    args = parser.parse_args()

    if not os.path.isfile(args.db):
        print('DB file not found:', args.db)
        return

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        if args.apply:
            apply_migration(conn)
        else:
            dry_run(conn)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
