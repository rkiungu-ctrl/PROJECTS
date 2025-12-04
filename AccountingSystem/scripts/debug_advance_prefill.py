"""
Debug script: compute advance auto-prefill for all employees for a given period(s)
Usage:
  python debug_advance_prefill.py 2025-01-01 2025-10-01

If no args provided, defaults to today's period.
"""
import sys
from datetime import date
from pathlib import Path
# ensure project package imports work
proj = Path(__file__).resolve().parents[1]
import os
sys.path.insert(0, str(proj))

from database import SessionLocal
import models
try:
    from routes import payroll as payroll_routes
except Exception as e:
    print('Failed to import routes.payroll:', e)
    raise


def list_due_for(period):
    db = SessionLocal()
    try:
        print('\n=== Period:', period, '===')
        rows = db.query(models.Employee).all()
        any_found = False
        for emp in rows:
            try:
                total, items = payroll_routes.compute_advance_total_for_period(db, emp.id, period)
            except Exception as e:
                print(f'Error computing for {getattr(emp, "staff_no", None)}: {e}')
                continue
            if total and total > 0:
                any_found = True
                print(f'Employee: {emp.staff_no} - {emp.name} -> auto advance: {total}')
                # list the matching advances
                M = payroll_routes._resolve_loanadvance_model()
                if M:
                    advs = db.query(M).filter(M.employee_id == emp.id).all()
                    for a in advs:
                        bal = getattr(a, 'balance_outstanding', getattr(a, 'balance', None))
                        inst = getattr(a, 'installment_amount', None)
                        dedm = getattr(a, 'deduction_method', None)
                        status = getattr(a, 'status', None)
                        nd = getattr(a, 'next_due_date', None)
                        print('  - Adv id:', getattr(a, 'id', None), 'bal=', bal, 'inst=', inst, 'method=', dedm, 'status=', status, 'next_due=', nd)
        if not any_found:
            print('No auto-prefill advances found for this period.')
    finally:
        db.close()


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        periods = [date.today()]
    else:
        periods = []
        for a in args:
            try:
                periods.append(date.fromisoformat(a))
            except Exception:
                print('Invalid date:', a)
    for p in periods:
        list_due_for(p)
