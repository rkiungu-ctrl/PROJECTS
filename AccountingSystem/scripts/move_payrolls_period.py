"""
Move payroll rows from one period to another and optionally recompute using current settings.

Usage:
  python scripts/move_payrolls_period.py FROM_PERIOD TO_PERIOD [--recompute]

Example:
  python scripts/move_payrolls_period.py 2025-02 2025-01 --recompute

This will update payroll rows whose period == FROM_PERIOD to TO_PERIOD and (if --recompute)
will recompute NSSF/PAYE/net for the target period.
"""
from datetime import date
import sys
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
    if len(sys.argv) < 3:
        print("Usage: python scripts/move_payrolls_period.py FROM_PERIOD TO_PERIOD [--recompute]")
        sys.exit(1)
    from_arg = sys.argv[1]
    to_arg = sys.argv[2]
    do_recompute = '--recompute' in sys.argv

    from_period = parse_period(from_arg)
    to_period = parse_period(to_arg)

    db = SessionLocal()
    try:
        rows = db.query(models.Payroll).filter(models.Payroll.period == from_period).all()
        if not rows:
            print(f"No payroll rows found for period {from_period}")
            return
        print(f"Found {len(rows)} payroll rows for {from_period}. Moving to {to_period}...")
        ids = [r.id for r in rows]
        # update periods
        updated = db.query(models.Payroll).filter(models.Payroll.id.in_(ids)).update({models.Payroll.period: to_period}, synchronize_session=False)
        db.commit()
        print(f"Updated {updated} rows' period to {to_period}")

        if do_recompute:
            print("Recomputing payroll rows for the new period...")
            payrolls = db.query(models.Payroll).filter(models.Payroll.period == to_period).all()
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
