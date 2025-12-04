#!/usr/bin/env python3
"""
Normalize historic payroll statutory fields using the centralized
compute_statutories_with_flags helper.

Usage:
  python normalize_payroll_statutories.py [--period YYYY-MM] [--limit N] [--apply]

Options:
  --period YYYY-MM   Only process payrolls for this year-month (first day used)
  --limit N          Only process first N payroll rows (for testing)
  --apply            Actually write changes to the DB. Without this, the script runs in dry-run mode.

This script is safe to run repeatedly; unchanged rows will be skipped.
"""

import argparse
from datetime import datetime, date
from decimal import Decimal

from database import SessionLocal
from models.payroll import Payroll as PayrollModel
from models.employee import Employee as EmployeeModel

# Import the helper from routes.payroll
try:
    from routes.payroll import compute_statutories
except Exception as e:
    compute_statutories = None


def parse_args():
    p = argparse.ArgumentParser(description="Normalize payroll statutory fields")
    p.add_argument("--period", help="YYYY-MM to filter payrolls (optional)")
    p.add_argument("--limit", type=int, default=0, help="Limit number of rows to process (0 = all)")
    p.add_argument("--apply", action="store_true", help="Apply changes to DB (default: dry-run)")
    return p.parse_args()


def ym_to_date(ym: str) -> date:
    parts = ym.split("-")
    if len(parts) < 2:
        raise ValueError("Period must be YYYY-MM")
    y = int(parts[0])
    m = int(parts[1])
    return date(y, m, 1)


def fmt(v):
    try:
        return float(v or 0.0)
    except Exception:
        return 0.0


def main():
    args = parse_args()
    session = SessionLocal()
    if compute_statutories is None:
        print("ERROR: compute_statutories not importable from routes.payroll. Ensure routes.payroll is on PYTHONPATH and the helper exists.")
        return

    q = session.query(PayrollModel).join(EmployeeModel)
    if args.period:
        pdate = ym_to_date(args.period)
        q = q.filter(PayrollModel.period == pdate)
    q = q.order_by(PayrollModel.period.desc())
    if args.limit and args.limit > 0:
        rows = q.limit(args.limit).all()
    else:
        rows = q.all()

    total = len(rows)
    print(f"Found {total} payroll rows to inspect")
    changed = 0
    for i, pr in enumerate(rows, start=1):
        emp = pr.employee
        if not emp:
            print(f"[{i}/{total}] payroll id={pr.id} missing employee, skipping")
            continue
        gross = fmt(pr.gross_pay) or (
            fmt(pr.basic_salary) + fmt(pr.house_allowance) + fmt(pr.transport_allowance) + fmt(pr.other_allowances) + fmt(pr.commission) + fmt(pr.bonus)
        )
        try:
            ahl, shif, nssf, paye, taxable, nssf_employer = compute_statutories(session, emp, gross, pr.period)
            
            # Calculate NITA employer contribution - exempt for interns
            employment_type_val = (getattr(emp, 'employment_type', None) or "").strip().lower()
            nita_employer = 0 if 'intern' in employment_type_val else 50
            
            # Create stats dict to match expected format
            stats = {
                'shif': shif,
                'nssf': nssf,
                'ahl': ahl,
                'paye': paye,
                'taxable_pay': taxable,
                'nssf_employer': nssf_employer,
                'ahl_employer': ahl,  # AHL employer is same as employee AHL
                'nita_employer': nita_employer,
            }
        except Exception as e:
            print(f"[{i}/{total}] payroll id={pr.id} compute failed: {e}")
            continue

        # Fields to sync
        updates = {}
        mapping = {
            'shif': 'shif',
            'nssf': 'nssf',
            'ahl': 'ahl',
            'paye': 'paye',
            'taxable_pay': 'taxable_pay',
            'nssf_employer': 'nssf_employer',
            'ahl_employer': 'ahl_employer',
            'nita_employer': 'nita_employer',
        }
        for key, col in mapping.items():
            newv = float(stats.get(key, 0.0) or 0.0)
            oldv = float(getattr(pr, col, 0.0) or 0.0)
            # treat small rounding diffs as equal
            if round(oldv - newv, 2) != 0:
                updates[col] = (oldv, newv)

        if not updates:
            print(f"[{i}/{total}] payroll id={pr.id} OK (no changes)")
            continue

        print(f"[{i}/{total}] payroll id={pr.id} CHANGES:")
        for col, (oldv, newv) in updates.items():
            print(f"    {col}: {oldv} -> {newv}")

        if args.apply:
            # Apply updates
            for col, (_, newv) in updates.items():
                try:
                    setattr(pr, col, round(float(newv or 0.0), 2))
                except Exception:
                    pass
            # Recompute net_pay and gross/taxable as safety
            try:
                pr.taxable_pay = round(float(stats.get('taxable_pay', pr.taxable_pay or 0.0) or 0.0), 2)
            except Exception:
                pass
            try:
                pr.gross_pay = round(float(stats.get('gross', pr.gross_pay or 0.0) or 0.0), 2)
            except Exception:
                pass
            # recompute net_pay: gross - (ahl + shif + nssf + paye + loan + advance)
            try:
                loan = float(pr.loan or 0.0)
                adv = float(pr.advance or 0.0)
                ahl_v = float(pr.ahl or 0.0)
                shif_v = float(pr.shif or 0.0)
                nssf_v = float(pr.nssf or 0.0)
                paye_v = float(pr.paye or 0.0)
                pr.net_pay = round((pr.gross_pay or 0.0) - (ahl_v + shif_v + nssf_v + paye_v + loan + adv), 2)
            except Exception:
                pass
            try:
                session.add(pr)
                session.commit()
                changed += 1
                print(f"    applied and committed")
            except Exception as e:
                session.rollback()
                print(f"    failed to commit: {e}")
        else:
            print("    dry-run (use --apply to modify DB)")

    print(f"Done. {changed} rows updated (apply={'yes' if args.apply else 'no'})")


if __name__ == '__main__':
    main()
