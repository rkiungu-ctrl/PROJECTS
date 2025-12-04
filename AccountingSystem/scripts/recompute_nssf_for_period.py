"""
Recompute NSSF, PAYE and net pay for all payroll rows in a given period
using the current NSSF settings. Run from the project root like:

python scripts/recompute_nssf_for_period.py 2025-01

The period may be YYYY-MM or YYYY-MM-DD. The script will normalize YYYY-MM
→ YYYY-MM-01.

This is a safe helper for re-calculating legacy payroll rows after changing
NSSF logic.
"""
from datetime import date
import sys
from decimal import Decimal

from database import SessionLocal
import models


def parse_period(s: str) -> date:
    if len(s) == 7 and s.count('-') == 1:
        s = f"{s}-01"
    return date.fromisoformat(s)


def resolve_nssf_local(db, period: date, gross: float):
    try:
        setting = (
            db.query(models.NSSFSetting)
            .filter(models.NSSFSetting.start_date <= period)
            .filter((models.NSSFSetting.end_date == None) | (models.NSSFSetting.end_date >= period))
            .order_by(models.NSSFSetting.start_date.desc())
            .first()
        )
    except Exception:
        setting = None

    if setting:
        rate_emp = float(setting.rate_employee or 0)
        rate_er = float(setting.rate_employer or 0)
        try:
            max_total = float(setting.max_employee_total or 0)
        except Exception:
            max_total = 0

        employee_calc = round(gross * rate_emp, 2)
        employer_calc = round(gross * rate_er, 2)

        if max_total and employee_calc > max_total:
            employee_calc = float(max_total)
        if max_total and employer_calc > max_total:
            employer_calc = float(max_total)

        return employee_calc, employer_calc

    # fallback
    tier1 = min(gross, 8000) * 0.06
    tier2 = min(max(gross - 8000, 0), 64000) * 0.06
    total = round(tier1 + tier2, 2)
    return total, total


def calculate_paye_local(taxable: float) -> float:
    if taxable <= 24000:
        tax = taxable * 0.1
    elif taxable <= 32333:
        tax = (24000 * 0.1) + ((taxable - 24000) * 0.25)
    else:
        tax = (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3)
    return max(tax - 2400, 0)


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/recompute_nssf_for_period.py YYYY-MM")
        sys.exit(1)
    period_arg = sys.argv[1]
    period_date = parse_period(period_arg)

    db = SessionLocal()
    try:
        payrolls = db.query(models.Payroll).filter(models.Payroll.period == period_date).all()
        if not payrolls:
            print(f"No payroll rows found for period {period_date}")
            return

        print(f"Found {len(payrolls)} payroll rows for {period_date}. Recomputing...")
        for p in payrolls:
            gross = float((p.basic_salary or 0) + (p.house_allowance or 0) + (p.transport_allowance or 0) + (p.other_allowances or 0) + (p.commission or 0) + (p.bonus or 0) + (getattr(p, 'non_cash_benefit', 0) or 0))
            ahl = round(gross * 0.015, 2)
            shif = 1700 if p.period < date(2024, 7, 1) else round(max(gross * 0.0275, 300), 2)
            nssf, nssf_employer = resolve_nssf_local(db, p.period, gross)
            taxable = round(gross - ahl - shif - nssf, 2)
            paye = round(calculate_paye_local(taxable), 2)
            deductions = ahl + shif + nssf + paye + (p.loan or 0) + (p.advance or 0)
            net_pay = round(gross - deductions, 2)

            print(f"{p.id}: gross={gross} old_nssf={p.nssf} new_nssf={nssf} paye={p.paye}->{paye} net={p.net_pay}->{net_pay}")

            p.ahl = ahl
            p.shif = shif
            p.nssf = nssf
            p.nssf_employer = nssf_employer
            p.taxable_pay = taxable
            p.paye = paye
            p.net_pay = net_pay
            db.add(p)

        db.commit()
        print("Recompute completed and saved.")
    finally:
        db.close()

if __name__ == '__main__':
    main()
