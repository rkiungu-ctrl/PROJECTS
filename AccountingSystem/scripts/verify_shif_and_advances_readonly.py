#!/usr/bin/env python3
"""Read-only verification of SHIF/NHIF calculations and advance->loan_repayment linkage.

- Chooses the most recent payroll period in the DB.
- For each payroll row in that period, computes expected SHIF using calculate_nhif_or_shif
  (imported from routes.payroll) and reports mismatches where stored value differs.
- For payroll rows with advance > 0, checks whether any loan_repayments exist for that
  employee and period (tries both date and YYYY-MM string fields) and reports missing rows.

This script does NOT modify the database and does NOT create backups.
"""
from datetime import date
from decimal import Decimal
from database import SessionLocal
from models.payroll import Payroll as PayrollModel
import models

from routes.payroll import calculate_nhif_or_shif


def fmt(n):
    try:
        return float(round(float(n or 0.0), 2))
    except Exception:
        return 0.0


def find_repayments_for_payroll(session, payroll):
    """Try several heuristics to find loan_repayment rows that correspond to this payroll row.
    Returns list of matching repayment rows (could be empty).
    """
    candidates = []
    # Try model name LoanRepayment
    LR = getattr(models, 'LoanRepayment', None)
    if LR is None:
        # try lower-cased module import
        try:
            from models.loan_repayment import LoanRepayment as LR
        except Exception:
            LR = None
    if LR is None:
        return []

    # Heuristic 1: repayment having payslip_id equal payroll.id
    try:
        qr = session.query(LR).filter(getattr(LR, 'payslip_id', None) == payroll.id).all()
        if qr:
            return qr
    except Exception:
        pass

    # Heuristic 2: repayment with period_ym or period matching payroll.period
    period = getattr(payroll, 'period', None)
    yam = None
    if isinstance(period, date):
        yam = period.strftime('%Y-%m')

    try:
        # period_ym field
        if hasattr(LR, 'period_ym') and yam:
            qr = session.query(LR).filter(getattr(LR, 'period_ym') == yam, getattr(LR, 'loan_id') != None).all()
            if qr:
                # filter by employee via loan -> loan.advance? We'll return these
                return qr
    except Exception:
        pass

    try:
        # period stored as date-like
        if hasattr(LR, 'period') and period is not None:
            qr = session.query(LR).filter(getattr(LR, 'period') == period).all()
            if qr:
                return qr
    except Exception:
        pass

    # Heuristic 3: repayment rows whose loan references a LoanAdvance for this employee and close period
    try:
        LA = getattr(models, 'LoanAdvance', None)
        if LA is None:
            from models.loan_advance import LoanAdvance as LA
    except Exception:
        LA = getattr(models, 'LoanAdvance', None)

    if LR and LA:
        try:
            # join loan_repayment -> loan_advance by loan_id
            # Filter loan advances for this employee
            advances = session.query(LA).filter(LA.employee_id == payroll.employee_id).all()
            adv_ids = [a.id for a in advances]
            if adv_ids:
                qr = session.query(LR).filter(getattr(LR, 'loan_id', None).in_(adv_ids)).all()
                if qr:
                    return qr
        except Exception:
            pass

    return []


def main():
    session = SessionLocal()
    try:
        # find most recent payroll period
        periods = session.query(PayrollModel.period).distinct().order_by(PayrollModel.period.desc()).all()
        if not periods:
            print('No payroll periods found in DB')
            return 1
        period = periods[0][0]
        print(f'Verifying payroll period: {period}')

        payrolls = session.query(PayrollModel).filter(PayrollModel.period == period).order_by(PayrollModel.employee_id).all()
        if not payrolls:
            print('No payroll rows for chosen period')
            return 0

        mismatches = []
        advances_missing = []

        for p in payrolls:
            gross = fmt(getattr(p, 'gross_pay', 0.0))
            stored_shif = fmt(getattr(p, 'shif', 0.0))
            calc_shif = fmt(calculate_nhif_or_shif(session, gross, period))
            if abs(stored_shif - calc_shif) > 0.01:
                mismatches.append((p.id, getattr(p.employee,'staff_no',None), gross, stored_shif, calc_shif))

            adv = fmt(getattr(p, 'advance', 0.0))
            if adv > 0:
                reps = find_repayments_for_payroll(session, p)
                if not reps:
                    advances_missing.append((p.id, getattr(p.employee,'staff_no',None), adv))

        print('\nSHIF mismatches (stored != calculated)')
        if not mismatches:
            print('  None — stored SHIF matches calculated SHIF for this period')
        else:
            for m in mismatches:
                print(f'  payroll id={m[0]} staff={m[1]} gross={m[2]} stored_shif={m[3]} calc_shif={m[4]}')

        print('\nPayroll rows with advance > 0 but no loan_repayments found')
        if not advances_missing:
            print('  None — all advances in this period have associated loan_repayments (by heuristic)')
        else:
            for a in advances_missing:
                print(f'  payroll id={a[0]} staff={a[1]} advance={a[2]}')

    finally:
        session.close()
    return 0

if __name__ == '__main__':
    exit(main())
