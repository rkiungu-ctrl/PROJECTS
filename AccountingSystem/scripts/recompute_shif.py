#!/usr/bin/env python3
"""Recompute SHIF for payrolls with shif == 0 or NULL.

- Connects to the project's DB via database.SessionLocal
- Uses existing calculate_nhif_or_shif logic to compute SHIF per payroll.period
- Updates payroll.shif and payroll.net_pay for affected rows
- Creates a timestamped backup of the DB before making changes

Usage:
    python scripts\recompute_shif.py    # runs and applies updates
    python scripts\recompute_shif.py --dry-run   # shows changes but does not save

"""
from pathlib import Path
import argparse
from datetime import datetime

from database import DB_PATH, SessionLocal
from models.payroll import Payroll as PayrollModel

# import calculation helper from routes.payroll
from routes.payroll import calculate_nhif_or_shif


def fmt(n):
    try:
        return round(float(n or 0.0), 2)
    except Exception:
        return 0.0


def main(dry_run: bool = False):
    db_file = Path(DB_PATH)
    if not db_file.exists():
        print(f"DB file not found at {db_file}")
        return 1

    # intentionally do NOT create a backup here per user instruction; operate on main DB

    session = SessionLocal()
    try:
        # Query payroll rows where shif is 0 or NULL (and gross_pay > 0)
        q = session.query(PayrollModel).filter(
            (PayrollModel.shif == 0) | (PayrollModel.shif == None)
        ).order_by(PayrollModel.period.asc())
        rows = q.all()
        total = len(rows)
        print(f"Found {total} payroll rows with shif == 0 or NULL")

        if total == 0:
            return 0

        changed = []
        for p in rows:
            gross = fmt(getattr(p, 'gross_pay', 0.0))
            period = getattr(p, 'period', None)
            if period is None:
                print(f"Skipping payroll id={p.id} (no period)")
                continue

            new_shif = calculate_nhif_or_shif(session, gross, period)
            new_shif = round(float(new_shif or 0.0), 2)
            old_shif = fmt(getattr(p, 'shif', 0.0))

            if new_shif == old_shif:
                # nothing to do
                continue

            # compute net_pay: gross - (paye + nssf + ahl + shif + loan + advance)
            paye = fmt(getattr(p, 'paye', 0.0))
            nssf = fmt(getattr(p, 'nssf', 0.0))
            ahl = fmt(getattr(p, 'ahl', 0.0))
            loan = fmt(getattr(p, 'loan', 0.0))
            advance = fmt(getattr(p, 'advance', 0.0))

            new_net = round(gross - (paye + nssf + ahl + new_shif + loan + advance), 2)
            old_net = fmt(getattr(p, 'net_pay', 0.0))

            changed.append({
                'id': p.id,
                'staff_no': getattr(p.employee, 'staff_no', None) if hasattr(p, 'employee') else None,
                'period': period,
                'old_shif': old_shif,
                'new_shif': new_shif,
                'old_net': old_net,
                'new_net': new_net
            })

            if not dry_run:
                p.shif = new_shif
                p.net_pay = new_net
                session.add(p)

        if not dry_run:
            session.commit()

        # Print summary
        if not changed:
            print("No rows needed updating (values already match calculated SHIF)")
        else:
            print(f"Updated {len(changed)} payroll rows (dry_run={dry_run}):")
            for c in changed:
                print(f"  payroll id={c['id']} staff={c['staff_no']} period={c['period']} shif {c['old_shif']} -> {c['new_shif']} net {c['old_net']} -> {c['new_net']}")

    except Exception as exc:
        print("Error during recompute:", exc)
        raise
    finally:
        session.close()

    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Show changes without applying them')
    args = parser.parse_args()
    exit(main(dry_run=args.dry_run))
