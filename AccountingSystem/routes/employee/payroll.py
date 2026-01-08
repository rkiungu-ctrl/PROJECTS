from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from fastapi import BackgroundTasks as _BackgroundTasks
from email.message import EmailMessage
import smtplib, io, os
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional
import io
from openpyxl import Workbook
from sqlalchemy import func, text
from calendar import monthrange

from database import get_db
import models
from models.payroll import Payroll as PayrollModel
from schemas.payroll import PayrollOut, CreatePayroll, PayrollSummary, PayrollDetailSchema, PayrollDetail
from models.journal import JournalEntry, JournalLine
from models.account import Account
from schemas.payslip import Payslip
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.pdfencrypt import StandardEncryption
# Optional HTML->PDF stack (weasyprint + jinja2 + PyPDF2). Import lazily and
# degrade to ReportLab-based renderer if any piece is missing so the app can
# still start on machines without WeasyPrint native deps (common on Windows).
try:
    from jinja2 import Template
    _HAS_JINJA = True
except Exception:
    Template = None
    _HAS_JINJA = False

try:
    from weasyprint import HTML
    _HAS_WEASY = True
except Exception:
    HTML = None
    _HAS_WEASY = False

try:
    from PyPDF2 import PdfReader, PdfWriter
    _HAS_PYPDF2 = True
except Exception:
    PdfReader = None
    PdfWriter = None
    _HAS_PYPDF2 = False

try:
    # Playwright (Chromium) fallback for HTML->PDF on platforms where WeasyPrint
    # native libraries are unavailable (common on Windows). The package must be
    # installed and browsers fetched via `python -m playwright install`.
    from playwright.sync_api import sync_playwright
    _HAS_PLAYWRIGHT = True
except Exception:
    sync_playwright = None
    _HAS_PLAYWRIGHT = False

import datetime as _dt

router = APIRouter(
    prefix="/payrolls",
    tags=["Payroll"]
)


def _apply_payroll_to_loans(
    db: Session, employee_id: int, period_date: date, payslip_id: int,
    loan_amount: float, advance_amount: float
):
    """Distribute payroll deductions into oldest open loans/advances and write repayment rows if the tables exist.

    This function is defensive: if LoanAdvance/LoanRepayment models are not present
    in the current DB schema it will noop and not raise, preserving compatibility.
    """
    try:
        LoanAdvance = getattr(models, "LoanAdvance", None)
        LoanRepayment = getattr(models, "LoanRepayment", None)
        if LoanAdvance is None:
            return  # nothing to do in DBs without the table

        period_ym = period_date.strftime("%Y-%m")

        def for_type(is_advance: bool):
            q = db.query(LoanAdvance).filter(
                LoanAdvance.employee_id == employee_id,
                LoanAdvance.balance_outstanding > 0
            )
            # filter by textual loan_type if the column exists
            try:
                if is_advance:
                    q = q.filter(func.lower(LoanAdvance.loan_type).like("%advance%"))
                else:
                    q = q.filter(~func.lower(LoanAdvance.loan_type).like("%advance%"))
            except Exception:
                # if no loan_type column, treat everything as "loan" bucket
                if is_advance:
                    return []
            return q.order_by(LoanAdvance.date_issued.asc()).all()

        def apply_bucket(amount_left: float, is_advance: bool):
            if amount_left <= 0:
                return 0.0
            rows = for_type(is_advance)
            for ln in rows:
                if amount_left <= 0:
                    break
                bal = float(getattr(ln, "balance_outstanding", 0) or 0)
                if bal <= 0:
                    continue
                pay = min(bal, amount_left)
                ln.balance_outstanding = round(bal - pay, 2)
                try:
                    if ln.balance_outstanding <= 0:
                        ln.status = "Cleared"
                        ln.next_due_period = None
                except Exception:
                    pass

                # Write/merge repayment if that table exists
                if LoanRepayment is not None:
                    try:
                        # Prefer to find a payslip-scoped repayment row first (by loan+period+payslip)
                        rp = db.query(LoanRepayment).filter(
                            LoanRepayment.loan_id == ln.id,
                            LoanRepayment.period_ym == period_ym,
                            LoanRepayment.payslip_id == payslip_id
                        ).first()

                        if rp is not None:
                            # ORM-mapped row found, update fields
                            try:
                                rp.amount = round(float(pay), 2)
                                rp.paid = True
                                rp.paid_on = period_date
                                rp.payslip_id = payslip_id
                            except Exception:
                                # fallback to SQL update if attribute assignment fails
                                db.execute(text("UPDATE loan_repayments SET amount = :amt, paid = 1, paid_on = :pon, payslip_id = :pid WHERE id = :id"),
                                           {'amt': round(pay,2), 'pon': period_date, 'pid': payslip_id, 'id': getattr(rp, 'id', None)})
                        else:
                            # no payslip-scoped row: try to find any repayment for this loan+period
                            rp_any = db.query(LoanRepayment).filter(
                                LoanRepayment.loan_id == ln.id,
                                LoanRepayment.period_ym == period_ym
                            ).first()
                            if rp_any is not None:
                                # attach legacy row to this payslip and update amount
                                try:
                                    rp_any.payslip_id = payslip_id
                                    rp_any.amount = round(float(pay), 2)
                                    rp_any.paid = True
                                    rp_any.paid_on = period_date
                                except Exception:
                                    db.execute(text("UPDATE loan_repayments SET amount = :amt, paid = 1, paid_on = :pon, payslip_id = :pid WHERE id = :id"),
                                               {'amt': round(pay,2), 'pon': period_date, 'pid': payslip_id, 'id': getattr(rp_any, 'id', None)})
                            else:
                                # create a fresh repayment row using direct SQL (schema-tolerant)
                                try:
                                    db.execute(text(
                                        "INSERT INTO loan_repayments (loan_id, reference_no, period_ym, amount, payslip_id, paid, paid_on, created_at) VALUES (:lid, :ref, :p, :amt, :pid, 1, :pon, datetime('now'))"
                                    ), {'lid': ln.id, 'ref': getattr(ln, 'reference_no', None), 'p': period_ym, 'amt': round(pay,2), 'pid': payslip_id, 'pon': period_date})
                                except Exception:
                                    # last-resort: ignore insertion errors so payroll continues
                                    pass
                    except Exception:
                        # swallow any loan/repayment sync errors to avoid breaking payroll
                        pass

                amount_left = round(amount_left - pay, 2)

            return amount_left

        # Advance then Loan buckets
        rem_adv = apply_bucket(float(advance_amount or 0), True)
        rem_loan = apply_bucket(float(loan_amount or 0), False)
        db.commit()
    except Exception:
        # never fail the main payroll flow because of a loan sync error
        db.rollback()


def prorate_salary(employee, payroll_period, salary):
    # If employed mid-month, prorate
    if getattr(employee, "date_of_employment", None) and employee.date_of_employment.month == payroll_period.month and employee.date_of_employment.year == payroll_period.year:
        days_in_month = monthrange(payroll_period.year, payroll_period.month)[1]
        start_day = employee.date_of_employment.day
        worked_days = days_in_month - start_day + 1
        return round((salary / days_in_month) * worked_days, 2)
    return salary


def resolve_nssf(db: Session, period: date, gross: float, setting=None):
    """Resolve NSSF employee and employer contributions for a given period and gross pay.

    Uses the NSSFSetting effective for `period` when present. If a SQL error
    occurs while querying the settings table we raise an explicit HTTPException
    so the issue is visible instead of silently falling back to legacy logic.

    If an optional `setting` object is passed, it will be used directly (this
    avoids double queries when caller already loaded the setting for debug).
    Returns a tuple: (employee_contribution, employer_contribution)
    """
    # Load setting if not provided. Make failures explicit.
    if setting is None:
        try:
            setting = (
                db.query(models.NSSFSetting)
                .filter(models.NSSFSetting.start_date <= period)
                .filter((models.NSSFSetting.end_date == None) | (models.NSSFSetting.end_date >= period))
                .order_by(models.NSSFSetting.start_date.desc())
                .first()
            )
        except Exception as e:
            # Fail fast with a clear message so missing export/table issues are visible.
            raise HTTPException(status_code=500, detail=f"Failed to query NSSF settings: {e}")

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

    # No setting found for the period — keep legacy tiered fallback as a guardrail
    # but this path should be rare if NSSF settings are configured properly.
    tier1 = min(gross, 8000) * 0.06
    tier2 = min(max(gross - 8000, 0), 64000) * 0.06
    total = round(tier1 + tier2, 2)
    return total, total

@router.post("/", response_model=PayrollOut)
def create_payroll(
    payroll: CreatePayroll,
    skip_existing: bool = False,
    db: Session = Depends(get_db)
):
    # normalize incoming period to first day of month to avoid off-by-one/month-shift issues
    try:
        payroll_period = payroll.period.replace(day=1)
    except Exception:
        payroll_period = payroll.period

    employee = db.query(models.Employee).filter(models.Employee.staff_no == payroll.staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee with that staff number not found")

    # Check for existing payroll for this employee and period
    existing = db.query(PayrollModel).filter(
        PayrollModel.employee_id == employee.id,
        PayrollModel.period == payroll_period
    ).first()
    
    if existing:
        if skip_existing:
            return {"message": f"Payroll for {payroll.staff_no} for period {payroll_period} already exists, skipped", "skipped": True}
        else:
            raise HTTPException(
                status_code=409, 
                detail=f"Payroll for {payroll.staff_no} for period {payroll_period} already exists. Use ?skip_existing=true to skip existing records."
            )

    # Gross pay = cash earnings only (employee actually receives this)
    gross = (
        payroll.basic_salary +
        payroll.house_allowance +
        payroll.transport_allowance +
        payroll.other_allowances +
        payroll.commission +
        payroll.bonus
    )
    
    # Taxable pay = cash earnings + non-cash benefits (for PAYE calculation)
    taxable_base = gross + (getattr(payroll, 'non_cash_benefit', 0) or 0)

    # Compute statutory deductions while respecting per-employee flags
    # NSSF, SHIF, AHL use gross pay; PAYE uses taxable_base (includes non-cash benefits)
    ahl, shif, nssf, paye, taxable, nssf_employer = compute_statutories(db, employee, gross, payroll_period)
    
    # Always recalculate PAYE using taxable_base (gross + non_cash_benefit)
    # Taxable income after statutory deductions (but before PAYE)
    taxable_for_paye = taxable_base - ahl - shif - nssf
    def calculate_paye(taxable):
        if taxable <= 24000:
            tax = taxable * 0.1
        elif taxable <= 32333:
            tax = (24000 * 0.1) + ((taxable - 24000) * 0.25)
        else:
            tax = (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3)
        return max(tax - 2400, 0)
    paye = calculate_paye(taxable_for_paye)
    taxable = taxable_for_paye
    ahl_employer = ahl
    
    # NITA employer contribution - exempt for interns
    employment_type_val = (getattr(employee, 'employment_type', None) or "").strip().lower()
    nita_employer = 0 if 'intern' in employment_type_val else 50

    deductions = ahl + shif + nssf + paye + payroll.loan + payroll.advance
    net_pay = gross - deductions

    new_payroll = PayrollModel(
        employee_id=employee.id,
        period=payroll_period,
        basic_salary=payroll.basic_salary,
        house_allowance=payroll.house_allowance,
        transport_allowance=payroll.transport_allowance,
        other_allowances=payroll.other_allowances,
        commission=payroll.commission,
        non_cash_benefit=getattr(payroll, 'non_cash_benefit', 0) or 0,
        bonus=payroll.bonus,
        gross_pay=round(gross, 2),
        taxable_pay=round(taxable, 2),  # This is taxable income after deductions
        shif=round(shif, 2),
        nssf=round(nssf, 2),
        paye=round(paye, 2),
        ahl=round(ahl, 2),
        loan=round(payroll.loan, 2),
        advance=round(payroll.advance, 2),
        net_pay=round(net_pay, 1),
        ahl_employer=round(ahl_employer, 2),
        nssf_employer=round(nssf_employer, 2),
        nita_employer=round(nita_employer, 2)
    )

    db.add(new_payroll)
    db.commit()
    db.refresh(new_payroll)
    # Apply payroll deductions to loans/advances (schema-tolerant)
    try:
        if (new_payroll.loan or 0) > 0 or (new_payroll.advance or 0) > 0:
            _apply_payroll_to_loans(
                db, employee.id, payroll_period, new_payroll.id,
                loan_amount=new_payroll.loan or 0,
                advance_amount=new_payroll.advance or 0
            )
    except Exception:
        # ignore loan sync problems so payroll creation remains primary
        pass
    return new_payroll


@router.get("/preview")
def preview_single_payroll(
    staff_no: str = Query(...),
    period: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Returns suggested figures for a single employee & period:
    - current salary components
    - auto_loan and auto_advance: the next due installment for the period
      (oldest loan first), 0 if none.
    """
    # normalize YYYY-MM -> YYYY-MM-01
    if isinstance(period, str) and len(period) == 7 and period.count("-") == 1:
        period_norm = f"{period}-01"
    else:
        period_norm = period
    from datetime import date as _date
    try:
        period_date = _date.fromisoformat(period_norm)
        period_ym = period_date.strftime("%Y-%m")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid period format. Use YYYY-MM or YYYY-MM-DD.")

    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # salary components from employee master
    out = {
        "staff_no": staff_no,
        "period": period_date,
        "basic_salary": float(emp.basic_salary or 0),
        "house_allowance": float(emp.house_allowance or 0),
        "transport_allowance": float(emp.transport_allowance or 0),
        "other_allowances": float(emp.other_allowances or 0),
        "commission": float(emp.commission or 0),
        "bonus": float(emp.bonus or 0),
        "non_cash_benefit": 0.0,
        "auto_loan": 0.0,
        "auto_advance": 0.0,
    }

    # include pending non-cash benefits for this period (if table exists)
    try:
        out["non_cash_benefit"] = float(
            db.query(func.coalesce(func.sum(models.EmployeeNonCashBenefit.amount), 0.0))
            .filter(models.EmployeeNonCashBenefit.staff_no == staff_no)
            .filter(models.EmployeeNonCashBenefit.period == period_date)
            .filter(models.EmployeeNonCashBenefit.is_applied == False)
            .scalar() or 0.0
        )
    except Exception:
        pass

    # compute NEXT installment due (not the whole balance) for Loans & Advances separately
    def next_due(total_type: str) -> float:
        # total_type: "loan" for normal loans, "advance" for salary advances
        amt = 0.0
        try:
            # Prefer models.LoanAdvance if present
            q = db.query(models.LoanAdvance).filter(
                models.LoanAdvance.employee_id == emp.id,
                models.LoanAdvance.balance_outstanding > 0
            )
            # Split by type keywords if the column exists
            try:
                if total_type == "advance":
                    q = q.filter(func.lower(models.LoanAdvance.loan_type).like("%advance%"))
                else:
                    q = q.filter(~func.lower(models.LoanAdvance.loan_type).like("%advance%"))
            except Exception:
                # if loan_type doesn't exist, just treat everything as "loan"
                if total_type == "advance":
                    return 0.0

            loans = q.order_by(models.LoanAdvance.date_issued.asc()).all()
            if not loans:
                return 0.0

            # Find the next due row for the requested period from schedule/repayments if available
            # Fallback: use installment_amount for the first active loan
            for ln in loans:
                # If a per-period schedule table exists, try to read it
                try:
                    sch = (ln.schedule or [])  # JSON column scenario
                except Exception:
                    sch = []

                # Check if we have a matching row for this period YM that is not paid
                due_row = None
                for r in sch:
                    if str(r.get("period_ym")) == period_ym and not r.get("paid", False):
                        due_row = r
                        break

                if due_row:
                    inst = float(due_row.get("installment") or due_row.get("principal") or 0)
                else:
                    # fallback to the configured installment_amount
                    inst = float(getattr(ln, "installment_amount", 0) or 0)

                if inst > 0:
                    amt = inst
                    break
        except Exception:
            amt = 0.0
        return round(amt, 2)

    out["auto_advance"] = next_due("advance")
    out["auto_loan"] = next_due("loan")
    return out


def compute_statutories(db: Session, employee, gross: float, period: date):
    """Compute statutory deductions while respecting employee deduction flags.

    Returns: (ahl, shif, nssf, paye, taxable, nssf_employer)
    """
    # AHL (housing levy) default rate
    ahl = gross * 0.015

    # SHIF: historical fixed or percentage floor
    shif = 0
    try:
        if bool(getattr(employee, 'deduct_shif', False)):
            shif = 1700 if period < date(2024, 7, 1) else max(gross * 0.0275, 300)
        else:
            shif = 0
    except Exception:
        shif = 0

    # NSSF: use resolve_nssf helper when permitted
    nssf = 0
    nssf_employer = 0
    try:
        if bool(getattr(employee, 'deduct_nssf', False)):
            nssf, nssf_employer = resolve_nssf(db, period, gross)
        else:
            nssf = 0
            nssf_employer = 0
    except Exception:
        nssf = 0
        nssf_employer = 0

    # AHL gate
    try:
        if not bool(getattr(employee, 'deduct_housing_levy', True)):
            ahl = 0
    except Exception:
        pass

    taxable = gross - ahl - shif - nssf
    taxable = max(taxable, 0)

    # PAYE: derive whether to compute PAYE from employee.income_tax and employment_type.
    # - If income_tax indicates 'Exempt' -> no tax
    # - If income_tax indicates 'Withholding' -> 5% withholding tax
    # - If income_tax indicates PAYE (contains 'paye' / 'primary' / 'secondary') -> compute PAYE
    # - If income_tax is empty/unset, treat interns as exempt and non-interns as subject to PAYE
    paye = 0
    try:
        income_tax_val = (getattr(employee, 'income_tax', None) or "").strip().lower()
        employment_type_val = (getattr(employee, 'employment_type', None) or "").strip().lower()

        # Decide tax calculation method
        tax_method = None
        if income_tax_val:
            if 'exempt' in income_tax_val:
                tax_method = 'exempt'
            elif 'withholding' in income_tax_val:
                tax_method = 'withholding'
            elif 'paye' in income_tax_val or 'primary' in income_tax_val or 'secondary' in income_tax_val:
                tax_method = 'paye'
        # If income_tax not explicit, fall back to employment_type heuristic
        if tax_method is None:
            if 'intern' in employment_type_val:
                tax_method = 'exempt'
            else:
                tax_method = 'paye'

        if tax_method == 'withholding':
            # Apply 5% withholding tax on taxable income
            paye = taxable * 0.05
        elif tax_method == 'paye':
            def _calc_paye(t):
                if t <= 24000:
                    tax = t * 0.1
                elif t <= 32333:
                    tax = (24000 * 0.1) + ((t - 24000) * 0.25)
                else:
                    tax = (24000 * 0.1) + (8333 * 0.25) + ((t - 32333) * 0.3)
                return max(tax - 2400, 0)
            paye = _calc_paye(taxable)
        else:
            paye = 0
    except Exception:
        paye = 0

    return ahl, shif, nssf, paye, taxable, nssf_employer


@router.get("/", response_model=List[PayrollOut])
def get_payrolls(
    staff_no: Optional[str] = None,
    period: Optional[date] = None,
    start_period: Optional[date] = None,
    end_period: Optional[date] = None,
    db: Session = Depends(get_db)
):
    query = db.query(PayrollModel).join(models.Employee)

    if staff_no:
        query = query.filter(models.Employee.staff_no == staff_no)
    if period:
        query = query.filter(PayrollModel.period == period)
    if start_period and end_period:
        query = query.filter(PayrollModel.period.between(start_period, end_period))

    query = query.order_by(PayrollModel.period.desc())
    return query.all()


@router.get("/export-excel/")
def export_payroll_summary(
    period: date,
    db: Session = Depends(get_db)
):
    payrolls = (
        db.query(PayrollModel)
        .join(models.Employee)
        .filter(PayrollModel.period == period)
        .all()
    )

    if not payrolls:
        raise HTTPException(status_code=404, detail="No payroll records found for the selected period")

    wb = Workbook()
    ws = wb.active
    ws.title = f"Payroll {period}"

    headers = ["Staff No", "Name", "Gross Pay", "NSSF", "SHIF", "AHL", "PAYE", "Loan/Advance", "Net Pay"]
    ws.append(headers)

    totals = [0.0] * (len(headers) - 2)

    created_payrolls = []
    for payroll in payrolls:
        row = [
            payroll.employee.staff_no,
            payroll.employee.name,
            payroll.gross_pay,
            payroll.nssf,
            payroll.shif,
            payroll.ahl,
            payroll.paye,
            payroll.loan + payroll.advance,
            payroll.net_pay
        ]
        ws.append(row)
        for i in range(2, len(row)):
            totals[i - 2] += row[i]

    ws.append(["", "TOTALS"] + [round(t, 2) for t in totals])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"payroll_summary_{period}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/bulk")
def create_bulk_payrolls(
    payrolls: List[CreatePayroll],
    confirm_overwrite: bool = False,
    skip_existing: bool = False,
    dry_run: bool = False,
    db: Session = Depends(get_db)
):
    results = []
    created_payrolls = []
    def calculate_paye(taxable):
        if taxable <= 24000:
            return taxable * 0.1
        elif taxable <= 32333:
            return (24000 * 0.1) + ((taxable - 24000) * 0.25)
        else:
            return (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3) - 2400

    # First pass: check for duplicates (same staff_no + period) to avoid accidental double-creates.
    duplicates = []
    for payroll in payrolls:
        if not getattr(payroll, 'staff_no', None) or not getattr(payroll, 'period', None):
            continue
        # normalize period to first of month for comparison
        try:
            p_period = payroll.period.replace(day=1)
        except Exception:
            p_period = payroll.period

        existing = db.query(PayrollModel).join(models.Employee).filter(
            models.Employee.staff_no == payroll.staff_no,
            PayrollModel.period == p_period
        ).first()
        if existing:
            duplicates.append({"staff_no": payroll.staff_no, "period": str(payroll.period), "existing_id": existing.id})

    if duplicates and not confirm_overwrite and not skip_existing:
        # refuse to create duplicates unless caller explicitly confirms overwrite or skip_existing
        raise HTTPException(status_code=409, detail={
            "message": "Duplicate payrolls found for the given period", 
            "duplicates": duplicates, 
            "hint": "Resubmit with query param ?confirm_overwrite=true to replace existing entries or ?skip_existing=true to create only for employees without existing payrolls"
        })

    # If confirm_overwrite is True, remove existing payrolls for staff/period pairs so we don't create duplicates.
    if duplicates and confirm_overwrite:
        for d in duplicates:
            try:
                db.query(PayrollModel).filter(PayrollModel.id == d['existing_id']).delete()
            except Exception:
                pass
        db.commit()

    # If skip_existing is True, filter out payrolls for employees who already have records
    if skip_existing and duplicates:
        duplicate_staff_nos = {d["staff_no"] for d in duplicates}
        original_count = len(payrolls)
        payrolls = [p for p in payrolls if getattr(p, 'staff_no', None) not in duplicate_staff_nos]
        skipped_count = original_count - len(payrolls)
        if skipped_count > 0:
            print(f"Skipped {skipped_count} employees who already have payroll for this period")

    # If dry_run is True, just return validation results without creating payrolls
    if dry_run:
        validation_results = []
        for payroll in payrolls:
            row_errors = []
            # basic validation
            if not getattr(payroll, 'staff_no', None):
                row_errors.append('staff_no is required')
            if not getattr(payroll, 'period', None):
                row_errors.append('period is required')
            # numeric fields
            try:
                basic = float(payroll.basic_salary or 0)
                if basic < 0:
                    row_errors.append('basic_salary cannot be negative')
            except Exception:
                row_errors.append('basic_salary must be a number')
            try:
                ncb = float(getattr(payroll, 'non_cash_benefit', 0) or 0)
                if ncb < 0:
                    row_errors.append('non_cash_benefit cannot be negative')
            except Exception:
                row_errors.append('non_cash_benefit must be a number')

            if row_errors:
                validation_results.append({"staff_no": getattr(payroll, 'staff_no', None), "success": False, "errors": row_errors})
                continue

            employee = db.query(models.Employee).filter(models.Employee.staff_no == payroll.staff_no).first()
            if not employee:
                validation_results.append({"staff_no": payroll.staff_no, "success": False, "errors": ["Employee not found"]})
            else:
                validation_results.append({"staff_no": payroll.staff_no, "success": True, "message": "Validation passed"})
        
        return validation_results

    for payroll in payrolls:
        row_errors = []
        # basic validation
        if not getattr(payroll, 'staff_no', None):
            row_errors.append('staff_no is required')
        if not getattr(payroll, 'period', None):
            row_errors.append('period is required')
        # numeric fields
        try:
            basic = float(payroll.basic_salary or 0)
            if basic < 0:
                row_errors.append('basic_salary cannot be negative')
        except Exception:
            row_errors.append('basic_salary must be a number')
        try:
            ncb = float(getattr(payroll, 'non_cash_benefit', 0) or 0)
            if ncb < 0:
                row_errors.append('non_cash_benefit cannot be negative')
        except Exception:
            row_errors.append('non_cash_benefit must be a number')

        if row_errors:
            results.append({"staff_no": getattr(payroll, 'staff_no', None), "success": False, "errors": row_errors})
            continue

        employee = db.query(models.Employee).filter(models.Employee.staff_no == payroll.staff_no).first()
        if not employee:
            results.append({"staff_no": payroll.staff_no, "success": False, "errors": ["Employee not found"]})
            continue

        # normalize period for storage and calculations
        try:
            p_period = payroll.period.replace(day=1)
        except Exception:
            p_period = payroll.period

        # Gross pay = cash earnings only (what employee actually receives)
        gross = (
            (payroll.basic_salary or 0) + (payroll.house_allowance or 0) +
            (payroll.transport_allowance or 0) + (payroll.other_allowances or 0) +
            (payroll.commission or 0) + (payroll.bonus or 0)
        )
        
        # Taxable pay = cash earnings + non-cash benefits (for PAYE calculation)
        taxable_base = gross + (getattr(payroll, 'non_cash_benefit', 0) or 0)

        # Compute statutory deductions with worker flags considered
        # NSSF, SHIF, AHL use gross pay; PAYE uses taxable_base (includes non-cash benefits)
        ahl, shif, nssf, paye, taxable, nssf_employer = compute_statutories(db, employee, gross, p_period)
        
        # Always recalculate PAYE using taxable_base (gross + non_cash_benefit)
        # Taxable income after statutory deductions (but before PAYE)
        taxable_for_paye = taxable_base - ahl - shif - nssf
        def calculate_paye(taxable):
            if taxable <= 24000:
                tax = taxable * 0.1
            elif taxable <= 32333:
                tax = (24000 * 0.1) + ((taxable - 24000) * 0.25)
            else:
                tax = (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3)
            return max(tax - 2400, 0)
        paye = calculate_paye(taxable_for_paye)
        taxable = taxable_for_paye
        ahl_employer = ahl
        
        # NITA employer contribution - exempt for interns
        employment_type_val = (getattr(employee, 'employment_type', None) or "").strip().lower()
        nita_employer = 0 if 'intern' in employment_type_val else 50
        deductions = ahl + shif + nssf + paye + (payroll.loan or 0) + (payroll.advance or 0)
        net_pay = gross - deductions

        new_payroll = PayrollModel(
            employee_id=employee.id,
            period=p_period,
            basic_salary=payroll.basic_salary,
            house_allowance=payroll.house_allowance,
            transport_allowance=payroll.transport_allowance,
            other_allowances=payroll.other_allowances,
            commission=payroll.commission,
            non_cash_benefit=getattr(payroll, 'non_cash_benefit', 0) or 0,
            bonus=payroll.bonus,
            gross_pay=round(gross, 2),
            taxable_pay=round(taxable, 2),  # This is taxable income after deductions
            shif=round(shif, 2),
            nssf=round(nssf, 2),
            paye=round(paye, 2),
            ahl=round(ahl, 2),
            loan=round(payroll.loan or 0, 2),
            advance=round(payroll.advance or 0, 2),
            net_pay=round(net_pay, 2),
            ahl_employer=round(ahl_employer, 2),
            nssf_employer=round(nssf_employer, 2),
            nita_employer=round(nita_employer, 2)
        )

        db.add(new_payroll)
        created_payrolls.append(new_payroll)
        results.append({"staff_no": payroll.staff_no, "success": True, "payroll_id": None})

    db.commit()
    # refresh created ids for successful rows
    created_iter = iter(created_payrolls)
    for i, r in enumerate(results):
        if r.get('success'):
            try:
                p = next(created_iter)
                db.refresh(p)
                r['payroll_id'] = p.id
            except StopIteration:
                r['payroll_id'] = None
    # After refreshing created payrolls, push loan/advance deductions into loan tables (defensive)
    try:
        for p in created_payrolls:
            try:
                db.refresh(p)
                if (getattr(p, 'loan', 0) or 0) > 0 or (getattr(p, 'advance', 0) or 0) > 0:
                    _apply_payroll_to_loans(db, p.employee_id, p.period, p.id, p.loan or 0, p.advance or 0)
            except Exception:
                # per-payroll failure shouldn't abort whole response
                continue
    except Exception:
        pass
    return results


@router.post("/{period}/post-to-journal")
def post_payroll_to_journal(
    period: date,
    db: Session = Depends(get_db)
):
    existing_entry = db.query(JournalEntry).filter(JournalEntry.reference == f"Payroll {period}").first()
    if existing_entry:
        raise HTTPException(status_code=400, detail="Payroll journal already posted for this period")

    payrolls = db.query(PayrollModel).filter(PayrollModel.period == period).all()
    if not payrolls:
        raise HTTPException(status_code=404, detail="No payroll found for the selected period")

    lines = []

    def get_account(name):
        account = db.query(Account).filter(Account.name == name).first()
        if not account:
            raise HTTPException(status_code=400, detail=f"Account '{name}' not found")
        return account.id

    total_salary = 0
    total_bonus = 0
    total_paye = 0
    total_nhif = 0
    total_ahl = 0
    total_nssf = 0
    total_netpay = 0
    total_ahl_employer = 0
    total_nssf_employer = 0
    total_nita_employer = 0

    for p in payrolls:
        total_salary += p.basic_salary + p.house_allowance + p.transport_allowance + p.other_allowances + p.commission
        total_bonus += p.bonus
        total_paye += p.paye
        total_nhif += p.shif
        total_ahl += p.ahl
        total_nssf += p.nssf
        total_netpay += p.net_pay
        total_ahl_employer += p.ahl_employer
        total_nssf_employer += p.nssf_employer
        total_nita_employer += p.nita_employer

    if total_salary:
        lines.append(JournalLine(account_id=get_account("Salaries and Wages"), debit=round(total_salary, 2), credit=0))
    if total_bonus:
        lines.append(JournalLine(account_id=get_account("Bonus"), debit=round(total_bonus, 2), credit=0))

    if total_paye:
        lines.append(JournalLine(account_id=get_account("PAYE Payable"), debit=0, credit=round(total_paye, 2)))
    if total_nhif:
        lines.append(JournalLine(account_id=get_account("NHIF Deductions Payable"), debit=0, credit=round(total_nhif, 2)))
    if total_nssf:
        lines.append(JournalLine(account_id=get_account("NSSF Deductions Payable"), debit=0, credit=round(total_nssf, 2)))
    if total_ahl:
        lines.append(JournalLine(account_id=get_account("AHL Deduction"), debit=0, credit=round(total_ahl, 2)))

    if total_nssf_employer:
        lines.append(JournalLine(account_id=get_account("Contribution to Retirement Fund"), debit=round(total_nssf_employer, 2), credit=0))
        lines.append(JournalLine(account_id=get_account("NSSF Deductions Payable"), debit=0, credit=round(total_nssf_employer, 2)))
    if total_ahl_employer:
        lines.append(JournalLine(account_id=get_account("Contribution to any Other Fund"), debit=round(total_ahl_employer, 2), credit=0))
        lines.append(JournalLine(account_id=get_account("AHL Deduction"), debit=0, credit=round(total_ahl_employer, 2)))
    if total_nita_employer:
        lines.append(JournalLine(account_id=get_account("Any Other Employment Cost"), debit=round(total_nita_employer, 2), credit=0))
        lines.append(JournalLine(account_id=get_account("NITA Payable"), debit=0, credit=round(total_nita_employer, 2)))

    if total_netpay:
        lines.append(JournalLine(account_id=get_account("Employee clearing account"), debit=0, credit=round(total_netpay, 2)))

    journal = JournalEntry(
        date=period,
        narration=f"Payroll Posting for {period}",
        reference=f"Payroll {period}",
        lines=lines
    )
    db.add(journal)
    db.commit()
    return {"message": "Payroll journal posted successfully"}


@router.get("/summary")
def get_payroll_summary(
    db: Session = Depends(get_db)
):
    total = db.query(func.sum(PayrollModel.gross_pay)).scalar() or 0
    return {"employment_costs": total}

@router.get("/periods", response_model=List[PayrollSummary])
def list_payroll_periods(db: Session = Depends(get_db)):
    periods = (
        db.query(
            PayrollModel.period,
            func.sum(PayrollModel.gross_pay).label("total_gross"),
            func.sum(PayrollModel.net_pay).label("total_net"),
            func.sum(PayrollModel.paye).label("total_paye"),
            func.sum(PayrollModel.nssf).label("total_nssf"),
            func.sum(PayrollModel.shif).label("total_shif"),
            func.sum(PayrollModel.ahl).label("total_ahl"),
            func.sum(PayrollModel.nssf_employer).label("total_nssf_employer"),
            func.sum(PayrollModel.ahl_employer).label("total_ahl_employer"),
            func.sum(PayrollModel.nita_employer).label("total_nita_employer"),
            func.count(PayrollModel.id).label("employee_count")
        )
        .group_by(PayrollModel.period)
        .order_by(PayrollModel.period.desc())
        .all()
    )
    return [
        PayrollSummary(
            period=p.period,
            total_gross=p.total_gross,
            total_net=p.total_net,
            total_paye=p.total_paye,
            total_nssf=p.total_nssf,
            total_shif=p.total_shif,
            total_ahl=p.total_ahl,
            total_nssf_employer=p.total_nssf_employer,
            total_ahl_employer=p.total_ahl_employer,
            total_nita_employer=p.total_nita_employer,
            employee_count=p.employee_count
        )
        for p in periods
    ]

@router.get("/{period}/summary", response_model=PayrollSummary)
def get_period_summary(period: date, db: Session = Depends(get_db)):
    p = (
        db.query(
            PayrollModel.period,
            func.sum(PayrollModel.gross_pay).label("total_gross"),
            func.sum(PayrollModel.net_pay).label("total_net"),
            func.count(PayrollModel.id).label("employee_count")
        )
        .filter(PayrollModel.period == period)
        .group_by(PayrollModel.period)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="No payroll found for this period")
    return PayrollSummary(
        period=p.period,
        total_gross=p.total_gross,
        total_net=p.total_net,
        employee_count=p.employee_count
    )

def get_payslip_number(payroll_id, period):
    # Example: SLIP/{id} {month}
    month_str = period.strftime("%B")
    return f"SLIP/{payroll_id} {month_str}"

@router.get("/{period}/details", response_model=List[PayrollDetailSchema])
def get_period_details(period: date, db: Session = Depends(get_db)):
    payrolls = (
        db.query(PayrollModel)
        .join(models.Employee)
        .filter(PayrollModel.period == period)
        .all()
    )
    return [
        PayrollDetailSchema(
            id=p.id,
            payslip_number=get_payslip_number(p.id, p.period),  # <-- Add this
            staff_no=p.employee.staff_no,
            job_title=p.employee.job_title,
            name=p.employee.name,
            basic_salary=p.basic_salary,
            house_allowance=p.house_allowance,
            transport_allowance=p.transport_allowance,
            other_allowances=p.other_allowances,
            commission=p.commission,
            bonus=p.bonus,
            gross_pay=p.gross_pay,
            nssf=p.nssf,
            shif=p.shif,
            ahl=p.ahl,
            paye=p.paye,
            loan=p.loan,
            advance=p.advance,
            net_pay=p.net_pay,
            ahl_employer=p.ahl_employer,
            nssf_employer=p.nssf_employer,
            nita_employer=p.nita_employer,
            bank_name=p.employee.bank_name,
            bank_account=p.employee.bank_account,
            branch_name=p.employee.branch_name,
            branch_code=p.employee.branch_code,
            nssf_number=p.employee.nssf_number,
            nhif_number=p.employee.nhif_number,
            kra_pin=p.employee.kra_pin,
            email=p.employee.personal_email,
            phone=p.employee.phone,
            id_number=p.employee.id_number,
            # Add any other fields you need
        )
        for p in payrolls
    ]


@router.get("/{period}/payslips", response_model=List[PayrollDetailSchema])
def get_payslips_for_period(period: str, db: Session = Depends(get_db)):
    """Return payslip rows for a given period.

    Accepts YYYY-MM or YYYY-MM-DD and normalizes YYYY-MM to the first day of the month.
    """
    # normalize period strings like '2025-01' -> '2025-01-01'
    if isinstance(period, str) and len(period) == 7 and period.count('-') == 1:
        period_norm = f"{period}-01"
    else:
        period_norm = period

    try:
        # let FastAPI/Pydantic handle strict parsing when converting to date below
        from datetime import date as _date
        period_date = _date.fromisoformat(period_norm)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid period format. Use YYYY-MM or YYYY-MM-DD.")

    payrolls = (
        db.query(PayrollModel)
        .join(models.Employee)
        .filter(PayrollModel.period == period_date)
        .all()
    )
    if not payrolls:
        raise HTTPException(status_code=404, detail="No payslips found for this period")

    return [
        PayrollDetailSchema(
            id=p.id,
            payslip_number=get_payslip_number(p.id, p.period),
            staff_no=p.employee.staff_no,
            job_title=p.employee.job_title,
            name=p.employee.name,
            basic_salary=p.basic_salary,
            house_allowance=p.house_allowance,
            transport_allowance=p.transport_allowance,
            other_allowances=p.other_allowances,
            commission=p.commission,
            bonus=p.bonus,
            gross_pay=p.gross_pay,
            taxable_pay=p.taxable_pay,
            nssf=p.nssf,
            shif=p.shif,
            ahl=p.ahl,
            paye=p.paye,
            non_cash_benefit=getattr(p, 'non_cash_benefit', 0) or 0,
            loan=p.loan,
            advance=p.advance,
            net_pay=p.net_pay,
            ahl_employer=p.ahl_employer,
            nssf_employer=p.nssf_employer,
            nita_employer=p.nita_employer,
            bank_name=p.employee.bank_name,
            bank_account=p.employee.bank_account,
            branch_name=p.employee.branch_name,
            branch_code=p.employee.branch_code,
            nssf_number=p.employee.nssf_number,
            nhif_number=p.employee.nhif_number,
            kra_pin=p.employee.kra_pin,
            email=p.employee.personal_email if getattr(p.employee, 'personal_email', None) else p.employee.email,
            phone=p.employee.phone,
            id_number=p.employee.id_number,
        )
        for p in payrolls
    ]


### PDF / Email helpers and endpoints
def _draw_payslip_on_canvas(c, slip):
    w, h = A4
    x = 20 * mm
    y = h - 20 * mm

    # Debug: Print slip data structure
    print(f"ReportLab Debug - Slip keys: {list(slip.keys())}")
    company = slip.get("company", {})
    print(f"ReportLab Debug - Company keys: {list(company.keys())}")
    print(f"ReportLab Debug - Company name: {company.get('name', 'N/A')}")
    print(f"ReportLab Debug - Earnings: {slip.get('earnings', 'NOT FOUND')}")
    print(f"ReportLab Debug - Deductions: {slip.get('deductions', 'NOT FOUND')}")
    print(f"ReportLab Debug - Individual values - Basic: {slip.get('basic_salary')}, NSSF: {slip.get('nssf')}")
    
    # Logo (if available) - centered at top like frontend
    logo_path = company.get("logo_file_path", "")
    print(f"ReportLab Debug - Logo path: '{logo_path}'")
    print(f"ReportLab Debug - Logo exists: {os.path.exists(logo_path) if logo_path else False}")
    
    if logo_path and os.path.exists(logo_path):
        try:
            print(f"ReportLab Debug - Attempting to draw logo: {logo_path}")
            # Draw logo centered at top like frontend
            logo_x = (w - 80) / 2  # Center the logo (80mm width)
            c.drawImage(logo_path, logo_x, y - 35, width=80, height=35, preserveAspectRatio=True, mask='auto')
            print(f"ReportLab Debug - Logo drawn successfully!")
            y -= 40 * mm  # Move down more after logo
        except Exception as e:
            # If logo fails to load, continue without it
            print(f"ReportLab Error: Could not load logo from {logo_path}: {e}")
            y -= 10 * mm
    else:
        print(f"ReportLab Debug - No logo to draw (path empty or file doesn't exist)")
        y -= 10 * mm

    # Company name centered
    c.setFont("Helvetica-Bold", 14)
    company_name = company.get("name", "") or slip.get("company_name", "")
    print(f"ReportLab Debug - Drawing company name: '{company_name}'")
    c.drawCentredString(w / 2, y, company_name)
    y -= 8 * mm

    # Title - centered like frontend
    c.setFont("Helvetica-Bold", 12)
    title_text = f"Payslip for the month of {slip.get('month_text', '')}"
    c.drawCentredString(w / 2, y, title_text)
    y -= 12 * mm

    # Employee details in a more structured layout
    c.setFont("Helvetica", 9)
    left_col = x
    right_col = w / 2 + 10 * mm
    lh = 6 * mm

    def draw_field(label, value, col_x, row_y):
        c.setFont("Helvetica-Bold", 9)
        c.drawString(col_x, row_y, f"{label}:")
        c.setFont("Helvetica", 9)
        c.drawString(col_x + 35 * mm, row_y, str(value or ""))

    # Left column
    draw_field("Name", slip.get("name"), left_col, y)
    draw_field("Job Title", slip.get("job_title", ""), left_col, y - lh)
    draw_field("Pay Period", slip.get("period"), left_col, y - 2*lh)
    
    # Right column  
    draw_field("Staff No", slip.get("staff_no"), right_col, y)
    draw_field("Email", slip.get("email", ""), right_col, y - lh)
    draw_field("Bank", slip.get("bank_name"), right_col, y - 2*lh)
    
    # Bank account spans both if needed
    if slip.get("bank_account"):
        draw_field("Bank A/C", slip.get("bank_account"), left_col, y - 3*lh)
    
    y -= 5*lh

    # Earnings and Deductions tables side by side
    y -= 8 * mm
    table_y_start = y
    left_table_x = left_col
    right_table_x = right_col
    table_width = (w / 2) - 20 * mm
    
    # Earnings table (left)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left_table_x, y, "EARNINGS")
    y -= 6 * mm
    
    c.setFont("Helvetica", 9)
    earnings = slip.get("earnings", [])
    earnings_y = y
    
    for label, val in earnings:
        # Show all earnings, even if zero (like frontend)
        c.drawString(left_table_x, earnings_y, label)
        c.drawRightString(left_table_x + table_width, earnings_y, f"{val or 0:,.2f}")
        earnings_y -= lh
    
    # Gross Pay total for earnings
    earnings_y -= 2 * mm
    c.setLineWidth(0.5)
    c.line(left_table_x, earnings_y + 2 * mm, left_table_x + table_width, earnings_y + 2 * mm)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left_table_x, earnings_y, "GROSS PAY")
    c.drawRightString(left_table_x + table_width, earnings_y, f"{slip.get('gross_pay', 0):,.2f}")
    c.setLineWidth(1.0)
    c.line(left_table_x, earnings_y - 2 * mm, left_table_x + table_width, earnings_y - 2 * mm)
    
    # Deductions table (right) 
    deductions_y = table_y_start
    c.setFont("Helvetica-Bold", 10)
    c.drawString(right_table_x, deductions_y, "DEDUCTIONS")
    deductions_y -= 6 * mm
    
    c.setFont("Helvetica", 9)
    deductions = slip.get("deductions", [])
    
    for label, val in deductions:
        # Show all deductions, even if zero (like frontend)
        c.drawString(right_table_x, deductions_y, label)
        c.drawRightString(right_table_x + table_width, deductions_y, f"{val or 0:,.2f}")
        deductions_y -= lh
    
    # Net Pay total
    deductions_y -= 2 * mm  
    c.setLineWidth(0.5)
    c.line(right_table_x, deductions_y + 2 * mm, right_table_x + table_width, deductions_y + 2 * mm)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(right_table_x, deductions_y, "NET PAY")
    c.drawRightString(right_table_x + table_width, deductions_y, f"{slip.get('net_pay', 0):,.2f}")
    c.setLineWidth(1.5)
    c.line(right_table_x, deductions_y - 2 * mm, right_table_x + table_width, deductions_y - 2 * mm)

    # Add payslip number in top right
    c.setFont("Helvetica", 9)
    slip_no_text = f"Payslip No: {slip.get('slip_no', '')}"
    c.drawRightString(w - x, h - 25 * mm, slip_no_text)
    
    # Footer area
    footer_y = 50 * mm
    
    # Stamp on the left
    stamp_path = company.get("stamp_file_path", "")
    print(f"ReportLab Debug - Stamp path: '{stamp_path}'")
    print(f"ReportLab Debug - Stamp exists: {os.path.exists(stamp_path) if stamp_path else False}")
    
    if stamp_path and os.path.exists(stamp_path):
        try:
            print(f"ReportLab Debug - Attempting to draw stamp: {stamp_path}")
            # Draw stamp on the left side, better positioning
            c.drawImage(stamp_path, x, footer_y - 30, width=50, height=30, preserveAspectRatio=True, mask='auto')
            print(f"ReportLab Debug - Stamp drawn successfully!")
        except Exception as e:
            print(f"ReportLab Error: Could not load stamp from {stamp_path}: {e}")
    else:
        print(f"ReportLab Debug - No stamp to draw (path empty or file doesn't exist)")
    
    # Created date
    c.setFont("Helvetica", 8)
    c.drawString(x + 60 * mm, footer_y - 15, f"Created: {slip.get('created')}")
    
    # Company footer info centered at bottom
    footer_text = company.get("footer", "") or slip.get("company_line", "")
    if footer_text:
        c.setFont("Helvetica", 7)
        c.drawCentredString(w / 2, 15 * mm, footer_text)

def _fetch_slip_payload(db: Session, payroll_id: int) -> dict:
    payroll = db.query(PayrollModel).filter(PayrollModel.id == payroll_id).first()
    if not payroll:
        raise HTTPException(status_code=404, detail="Payslip not found")
    employee = payroll.employee
    
    # Get both Company (if exists) and CompanyProfile for complete data
    company = db.query(models.Company).first() if hasattr(models, 'Company') else None
    
    # Import and get CompanyProfile (this contains the image paths)
    try:
        from models.company import CompanyProfile
        company_profile = db.query(CompanyProfile).first()
    except Exception:
        company_profile = None

    month_text = payroll.period.strftime("%B %Y") if hasattr(payroll.period, "strftime") else str(payroll.period)
    slip_no = f"SLIP{str(payroll.id).zfill(4)}"

    earnings = [
        ("Basic Salary", payroll.basic_salary or 0.0),
        ("House Allowance", payroll.house_allowance or 0.0),
        ("Transport Allowance", payroll.transport_allowance or 0.0),
        ("Other Allowances", payroll.other_allowances or 0.0),
        ("Commission", payroll.commission or 0.0),
        ("Bonus", payroll.bonus or 0.0),
        ("Non-Cash Benefit", getattr(payroll, 'non_cash_benefit', 0) or 0.0),
    ]
    deductions = [
        ("N.S.S.F.", payroll.nssf or 0.0),
        ("S.H.I.F.", payroll.shif or 0.0),
        ("A.H.L.", payroll.ahl or 0.0),
        ("Total Deductions Before Tax", (payroll.nssf or 0.0) + (payroll.shif or 0.0) + (payroll.ahl or 0.0)),
        ("Taxable Pay", payroll.taxable_pay or 0.0),
        ("P.A.Y.E.", payroll.paye or 0.0),
        ("Loan", payroll.loan or 0.0),
        ("Advance", payroll.advance or 0.0),
        ("Total Deductions After Tax", (payroll.loan or 0.0) + (payroll.advance or 0.0)),
    ]
    # Convert image paths for PDF generation (WeasyPrint needs absolute file paths)
    def _get_image_info():
        logo_url = ""
        stamp_url = ""
        logo_file_path = ""
        stamp_file_path = ""
        logo_file_url = ""
        stamp_file_url = ""
        
        print(f"DEBUG: company_profile exists: {company_profile is not None}")
        
        # Use the company_profile we retrieved above
        if company_profile:
            logo_path_attr = getattr(company_profile, 'logo_path', None)
            stamp_path_attr = getattr(company_profile, 'stamp_path', None)
            
            print(f"DEBUG: logo_path from DB: '{logo_path_attr}'")
            print(f"DEBUG: stamp_path from DB: '{stamp_path_attr}'")
            
            # For API responses (relative URLs)
            if logo_path_attr:
                logo_url = f"/static/company_logo/{os.path.basename(logo_path_attr)}"
                # For PDF generation (absolute file paths)
                if os.path.exists(logo_path_attr):
                    logo_file_path = logo_path_attr
                    print(f"DEBUG: Logo file exists at: '{logo_file_path}'")
                    # Convert Windows path to proper file URL for WeasyPrint
                    from pathlib import Path
                    logo_file_url = Path(logo_path_attr).as_uri()
                else:
                    print(f"DEBUG: Logo file does NOT exist at: '{logo_path_attr}'")
            
            if stamp_path_attr:
                stamp_url = f"/static/company_stamp/{os.path.basename(stamp_path_attr)}"
                # For PDF generation (absolute file paths)
                if os.path.exists(stamp_path_attr):
                    stamp_file_path = stamp_path_attr
                    print(f"DEBUG: Stamp file exists at: '{stamp_file_path}'")
                    # Convert Windows path to proper file URL for WeasyPrint
                    from pathlib import Path
                    stamp_file_url = Path(stamp_path_attr).as_uri()
                else:
                    print(f"DEBUG: Stamp file does NOT exist at: '{stamp_path_attr}'")
        else:
            print("DEBUG: No company_profile found in database!")
        
        print(f"DEBUG: Returning logo_file_path: '{logo_file_path}', stamp_file_path: '{stamp_file_path}'")
        return logo_url, stamp_url, logo_file_path, stamp_file_path, logo_file_url, stamp_file_url
    
    logo_url, stamp_url, logo_file_path, stamp_file_path, logo_file_url, stamp_file_url = _get_image_info()
    
    return {
        "company_name": getattr(company, "name", ""),
        "company_line": " | ".join([s for s in [getattr(company, "address", None), getattr(company, "email", None), getattr(company, "phone", None), getattr(company, "website", None)] if s]),
        "month_text": month_text,
        "slip_no": slip_no,
        "name": employee.name,
        "staff_no": employee.staff_no,
        "job_title": getattr(employee, 'job_title', "-"),
        "period": str(payroll.period)[:10],
        "bank_name": employee.bank_name,
        "bank_account": employee.bank_account,
        "basic_salary": payroll.basic_salary or 0.0,
        "house_allowance": payroll.house_allowance or 0.0,
        "transport_allowance": payroll.transport_allowance or 0.0,
        "other_allowances": payroll.other_allowances or 0.0,
        "commission": payroll.commission or 0.0,
        "bonus": payroll.bonus or 0.0,
        "non_cash_benefit": getattr(payroll, 'non_cash_benefit', 0) or 0.0,
        "gross_pay": payroll.gross_pay or 0.0,
        "nssf": payroll.nssf or 0.0,
        "shif": payroll.shif or 0.0,
        "ahl": payroll.ahl or 0.0,
        "paye": payroll.paye or 0.0,
        "taxable_pay": payroll.taxable_pay or 0.0,
        "loan": payroll.loan or 0.0,
        "advance": payroll.advance or 0.0,
        "net_pay": payroll.net_pay or 0.0,
        "created": payroll.created_at.strftime("%d/%m/%Y") if getattr(payroll, "created_at", None) else _dt.datetime.now().strftime("%d/%m/%Y"),
        # Add earnings and deductions arrays for ReportLab
        "earnings": earnings,
        "deductions": deductions,
        "company": {
            "name": (getattr(company_profile, "company_name", None) or 
                    getattr(company, "name", None) or 
                    "Tandaa Networks Ltd"),
            "logo_url": logo_url,
            "stamp_url": stamp_url,
            "logo_file_path": logo_file_path,  # Absolute path for ReportLab
            "stamp_file_path": stamp_file_path,  # Absolute path for ReportLab
            "logo_file_url": logo_file_url,  # Proper file:// URL for WeasyPrint
            "stamp_file_url": stamp_file_url,  # Proper file:// URL for WeasyPrint
            "footer": " | ".join([s for s in [
                getattr(company_profile, "address", None) or getattr(company, "address", None), 
                getattr(company_profile, "email", None) or getattr(company, "email", None), 
                getattr(company_profile, "phone", None) or getattr(company, "phone", None), 
                getattr(company_profile, "website", None) or getattr(company, "website", None)
            ] if s]),
        },
        "email": employee.personal_email if getattr(employee, 'personal_email', None) else getattr(employee, 'email', None),
        "employee_id_number": getattr(employee, 'id_number', None),
    }


if _HAS_JINJA:
    PDF_HTML = Template(r"""
<!doctype html>
<html>
    <head>
        <meta charset="utf-8">
        <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #111; }
            .header { text-align:center; margin-top: 6mm; }
            .logo { height: 38px; }
            .title { font-weight: 600; margin-top: 2mm; }
            .subtle { color:#666; }
            .row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6mm; }
            .left, .right { width: 48%; }
            .label { font-weight: 600; }
            table { width:100%; border-collapse: collapse; }
            td { padding: 3px 6px; }
            .line { border-top: 1px solid #333; }
            .double { border-bottom: 3px double #333; height: 3px; }
            .box { border: 1px solid #ddd; border-radius: 4px; }
            .section-title { font-weight: 600; margin: 2mm 0; }
            .footer { border-top:1px solid #ddd; text-align:center; font-size: 10px; color:#444; margin-top: 10mm; padding-top: 2mm; }
            .stamp-row { display:flex; align-items:center; gap:12px; margin-top: 10mm; }
            .stamp { height: 60px; }
            .money { text-align: right; white-space: nowrap; }
        </style>
    </head>
    <body>
        <div class="header">
            {% if company.logo_file_url %}<img class="logo" src="{{ company.logo_file_url }}">{% elif company.logo_url %}<img class="logo" src="{{ company.logo_url }}">{% endif %}
            <div class="title">{{ company.name }}</div>
            <div style="margin-top: 6mm; font-weight:600;">Payslip for the month of {{ month_text }}</div>
            <div class="subtle" style="margin-top:2mm;">Payslip No: {{ slip_no }}</div>
        </div>

        <div class="row" style="margin-top: 8mm;">
            <div class="left">
                <div><span class="label">Name:</span> {{ name }}</div>
                <div><span class="label">Job Title:</span> {{ job_title }}</div>
                <div><span class="label">Pay Period:</span> {{ period }}</div>
                <div><span class="label">Bank:</span> {{ bank_name }}</div>
                <div><span class="label">Bank A/C:</span> {{ bank_account }}</div>
            </div>
            <div class="right">
                <div><span class="label">Staff No:</span> {{ staff_no }}</div>
                <div><span class="label">Email:</span> {{ email }}</div>
            </div>
        </div>

        <div class="row" style="margin-top: 8mm;">
            <div class="left">
                <div class="section-title">EARNINGS</div>
                <table class="box">
                    <tr><td>Basic Salary</td><td class="money">{{ '{:,.2f}'.format(basic_salary) }}</td></tr>
                    <tr><td>House Allowance</td><td class="money">{{ '{:,.2f}'.format(house_allowance) }}</td></tr>
                    <tr><td>Transport Allowance</td><td class="money">{{ '{:,.2f}'.format(transport_allowance) }}</td></tr>
                    <tr><td>Other Allowances</td><td class="money">{{ '{:,.2f}'.format(other_allowances) }}</td></tr>
                    <tr><td>Commission</td><td class="money">{{ '{:,.2f}'.format(commission) }}</td></tr>
                    <tr><td>Bonus</td><td class="money">{{ '{:,.2f}'.format(bonus) }}</td></tr>
                    <tr><td>Non-Cash Benefit</td><td class="money">{{ '{:,.2f}'.format(non_cash_benefit) }}</td></tr>
                    <tr><td colspan="2" class="line"></td></tr>
                    <tr>
                        <td style="font-weight:600;">GROSS PAY</td>
                        <td class="money" style="font-weight:600;">{{ '{:,.2f}'.format(gross_pay) }}</td>
                    </tr>
                    <tr><td colspan="2" class="double"></td></tr>
                </table>
            </div>

            <div class="right">
                <div class="section-title">DEDUCTIONS</div>
                <table class="box">
                    <tr><td>N.S.S.F.</td><td class="money">{{ '{:,.2f}'.format(nssf) }}</td></tr>
                    <tr><td>S.H.I.F.</td><td class="money">{{ '{:,.2f}'.format(shif) }}</td></tr>
                    <tr><td>A.H.L.</td><td class="money">{{ '{:,.2f}'.format(ahl) }}</td></tr>
                    <tr><td>P.A.Y.E.</td><td class="money">{{ '{:,.2f}'.format(paye) }}</td></tr>
                    <tr><td>Loan</td><td class="money">{{ '{:,.2f}'.format(loan) }}</td></tr>
                    <tr><td>Advance</td><td class="money">{{ '{:,.2f}'.format(advance) }}</td></tr>
                    <tr><td colspan="2" class="line"></td></tr>
                    <tr>
                        <td style="font-weight:600;">NET PAY</td>
                        <td class="money" style="font-weight:600;">{{ '{:,.2f}'.format(net_pay) }}</td>
                    </tr>
                    <tr><td colspan="2" class="double"></td></tr>
                </table>
            </div>
        </div>

        <div class="stamp-row">
            {% if company.stamp_file_url %}<img class="stamp" src="{{ company.stamp_file_url }}">{% elif company.stamp_url %}<img class="stamp" src="{{ company.stamp_url }}">{% endif %}
            <div class="subtle">Created: {{ created }}</div>
        </div>

        <div class="footer">{{ company.footer }}</div>
    </body>
</html>
""")
else:
    PDF_HTML = None


def render_pdf_bytes_from_html(slip: dict, password: str | None = None) -> bytes:
    """
    Generate the payslip PDF.

    Priority:
    1. Use the same Tailwind-style HTML as the normal Download PDF (image 2)
       via Playwright when available.
    2. If Playwright is not installed / fails, fall back to the ReportLab
       layout (create_frontend_style_pdf), which is close to the frontend.
    3. If a password is provided and PyPDF2 is available, encrypt the PDF.
    """
    company = slip.get("company", {}) or {}

    # --- Encode logo and stamp to base64 for the HTML template ---
    logo_base64 = ""
    stamp_base64 = ""

    logo_path = company.get("logo_file_path", "")
    if logo_path and os.path.exists(logo_path):
        try:
            import base64
            with open(logo_path, "rb") as f:
                logo_data = f.read()
            logo_base64 = "data:image/png;base64," + base64.b64encode(logo_data).decode()
            print(f"[PDF] Logo encoded successfully from {logo_path}")
        except Exception as e:
            print(f"[PDF] Failed to encode logo: {e}")

    stamp_path = company.get("stamp_file_path", "")
    if stamp_path and os.path.exists(stamp_path):
        try:
            import base64
            with open(stamp_path, "rb") as f:
                stamp_data = f.read()
            stamp_base64 = "data:image/png;base64," + base64.b64encode(stamp_data).decode()
            print(f"[PDF] Stamp encoded successfully from {stamp_path}")
        except Exception as e:
            print(f"[PDF] Failed to encode stamp: {e}")

    pdf_bytes: bytes | None = None

    # --- 1) Try to use the Tailwind HTML + Playwright (matches image 2) ---
    try:
        from playwright.sync_api import sync_playwright  # type: ignore

        if _HAS_PLAYWRIGHT:
            print("[PDF] Using Playwright to render Tailwind HTML (frontend layout).")
            html = generate_payslip_html(slip, logo_base64, stamp_base64)

            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.set_content(html, wait_until="networkidle")
                pdf_bytes = page.pdf(format="A4", print_background=True)
                browser.close()
    except Exception as e:
        # Don't crash if Playwright is missing or fails – just log and fall back.
        print(f"[PDF] Playwright HTML->PDF failed, falling back to ReportLab. Error: {e}")
        pdf_bytes = None

    # --- 2) Fallback: ReportLab layout (create_frontend_style_pdf) ---
    if pdf_bytes is None:
        print("[PDF] Falling back to ReportLab frontend-style layout.")
        pdf_bytes = create_frontend_style_pdf(slip)

    # --- 3) Optional encryption with PyPDF2 ---
    if password and _HAS_PYPDF2:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            writer.encrypt(str(password))
            out = io.BytesIO()
            writer.write(out)
            print("[PDF] Password protection applied.")
            return out.getvalue()
        except Exception as e:
            # If encryption fails, return the unencrypted PDF instead of breaking.
            print(f"[PDF] Encryption failed, returning unencrypted PDF. Error: {e}")
            return pdf_bytes

    # No password requested or PyPDF2 missing – just return the PDF
    return pdf_bytes

def generate_payslip_html(slip: dict, logo_base64: str, stamp_base64: str) -> str:
    """Generate HTML identical to the frontend 'Download PDF' formatting"""
    
    def fmt(value):
        """Format currency exactly like frontend"""
        if value is None or value == 0:
            return "0.00"
        return f"{float(value):,.2f}"
    
    company = slip.get("company", {})
    
    # Calculate totals like frontend
    deductions_before_tax = (slip.get('nssf') or 0) + (slip.get('shif') or 0) + (slip.get('ahl') or 0)
    deductions_after_tax = (slip.get('loan') or 0) + (slip.get('advance') or 0)
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Payslip</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @page {{ size: A4 portrait; margin: 15mm 10mm; }}
            body {{ 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
            }}
            .border-b-4.border-double {{
                border-bottom: 4px double #d1d5db;
            }}
        </style>
    </head>
    <body>
        <div class="payslip-sheet mx-auto bg-white border rounded shadow-sm">
            <!-- Header: centered logo only -->
            <div class="pt-6 px-8">
                {f'<div class="w-full text-center"><img src="{logo_base64}" alt="Company Logo" class="h-14 w-auto mx-auto"></div>' if logo_base64 else ''}
                <div class="text-center mt-2 text-base font-semibold">{company.get('name', '')}</div>
            </div>

            <!-- Title -->
            <div class="mt-4 text-center font-semibold">Payslip {f"for the month of {slip.get('month_text', '')}" if slip.get('month_text') else ""}</div>

            <!-- Employee details -->
            <div class="mt-4 grid grid-cols-2 gap-2 text-sm px-8">
                <div><b>Name:</b> {slip.get('name', '')}</div>
                <div><b>Staff No:</b> {slip.get('staff_no', '')}</div>
                <div><b>Job Title:</b> {slip.get('job_title', '') or '-'}</div>
                <div><b>Email:</b> {slip.get('email', '') or '-'}</div>
                <div><b>Pay Period:</b> {slip.get('period', '')[:10] if slip.get('period') else ''}</div>
                <div><b>Payslip No:</b> SLIP{str(slip.get('slip_no', '')).replace('SLIP', '').zfill(4) if slip.get('slip_no') else ''}</div>
                <div><b>Bank:</b> {slip.get('bank_name', '') or '-'}</div>
                <div><b>Bank A/C:</b> {slip.get('bank_account', '') or '-'}</div>
            </div>

            <!-- Earnings & Deductions -->
            <div class="mt-6 grid grid-cols-2 gap-6 text-sm px-8">
                <!-- Earnings -->
                <div>
                    <div class="font-semibold mb-2">EARNINGS</div>
                    <div class="border rounded">
                        <div class="flex justify-between px-3 py-1 border-b"><span>Basic Salary</span><span>{fmt(slip.get('basic_salary'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>House Allowance</span><span>{fmt(slip.get('house_allowance'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>Transport Allowance</span><span>{fmt(slip.get('transport_allowance'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>Other Allowances</span><span>{fmt(slip.get('other_allowances'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>Commission</span><span>{fmt(slip.get('commission'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>Bonus</span><span>{fmt(slip.get('bonus'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>Non-Cash Benefit</span><span>{fmt(slip.get('non_cash_benefit'))}</span></div>

                        <!-- Gross row: single top border + double line below, bold -->
                        <div class="px-3 py-2 border-t font-bold">
                            <div class="flex justify-between">
                                <span>GROSS PAY</span>
                                <span>{fmt(slip.get('gross_pay'))}</span>
                            </div>
                            <div class="border-b-4 border-double mt-1"></div>
                        </div>
                    </div>
                </div>

                <!-- Deductions -->
                <div>
                    <div class="font-semibold mb-2">DEDUCTIONS</div>
                    <div class="border rounded">
                        <div class="flex justify-between px-3 py-1 border-b"><span>N.S.S.F.</span><span>{fmt(slip.get('nssf'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>S.H.I.F.</span><span>{fmt(slip.get('shif'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>A.H.L.</span><span>{fmt(slip.get('ahl'))}</span></div>

                        <div class="px-3 py-2 border-t font-bold">
                            <div class="flex justify-between">
                                <span>Total Deductions Before Tax</span>
                                <span>{fmt(deductions_before_tax)}</span>
                            </div>
                            <div class="border-b-4 border-double mt-1"></div>
                        </div>

                        <div class="flex justify-between px-3 py-1 border-b"><span>Taxable Pay</span><span>{fmt(slip.get('taxable_pay'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>P.A.Y.E.</span><span>{fmt(slip.get('paye'))}</span></div>

                        <div class="flex justify-between px-3 py-1 border-b"><span>Loan</span><span>{fmt(slip.get('loan'))}</span></div>
                        <div class="flex justify-between px-3 py-1 border-b"><span>Advance</span><span>{fmt(slip.get('advance'))}</span></div>

                        <div class="px-3 py-2 border-t font-bold">
                            <div class="flex justify-between">
                                <span>Total Deductions After Tax</span>
                                <span>{fmt(deductions_after_tax)}</span>
                            </div>
                            <div class="border-b-4 border-double mt-1"></div>
                        </div>

                        <div class="px-3 py-2 border-t font-bold text-base">
                            <div class="flex justify-between">
                                <span>NET PAY</span>
                                <span>{fmt(slip.get('net_pay'))}</span>
                            </div>
                            <div class="border-b-4 border-double mt-1"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Stamp bottom-left + created -->
            <div class="mt-8 px-8 flex items-center gap-6">
                {f'<img src="{stamp_base64}" alt="Company Stamp" class="h-20 w-20 object-contain border rounded bg-white p-1">' if stamp_base64 else '<div class="border border-dashed border-gray-400 w-32 h-20 flex items-center justify-center text-gray-500">Stamp</div>'}
                <div class="text-sm text-gray-600">Created: {slip.get('created', '')}</div>
            </div>

            <!-- Footer: single line -->
            <div class="px-8 pt-6 pb-10">
                <div class="border-t pt-2 text-xs text-center text-gray-700">{company.get('footer', '')}</div>
            </div>
        </div>
    </body>
    </html>
    """
    return html

def create_frontend_style_pdf(slip: dict) -> bytes:
    """Create a PDF that exactly matches the beautiful frontend layout"""
    print("🎨 Creating PDF that matches frontend exactly...")
    
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    
    # Import necessary modules
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    
    def fmt(value):
        if value is None or value == 0:
            return "0.00"
        return f"{float(value):,.2f}"
    
    width, height = A4
    margin = 40
    
    # Company Logo (if exists)
    company = slip.get('company', {})
    logo_path = company.get('logo_file_path', '')
    
    y_pos = height - 60
    
    # Draw logo if exists
    if logo_path and os.path.exists(logo_path):
        try:
            from reportlab.lib.utils import ImageReader
            c.drawImage(logo_path, width/2 - 30, y_pos - 10, width=60, height=40, preserveAspectRatio=True)
            y_pos -= 50
        except:
            pass
    
    # Company name
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width/2, y_pos, company.get('name', ''))
    y_pos -= 25
    
    # Payslip title  
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width/2, y_pos, f"Payslip for the month of {slip.get('month_text', '')}")
    y_pos -= 35
    
    # Employee details - matching frontend grid exactly
    c.setFont("Helvetica", 10)
    
    # Create the same 2x4 grid as frontend
    details_grid = [
        [f"Name: {slip.get('name', '')}", f"Staff No: {slip.get('staff_no', '')}"],
        [f"Job Title: {slip.get('job_title', '') or '-'}", f"Email: {slip.get('email', '') or '-'}"],
        [f"Pay Period: {slip.get('period', '')[:10] if slip.get('period') else ''}", 
         f"Payslip No: SLIP{str(slip.get('slip_no', '')).replace('SLIP', '').zfill(4) if slip.get('slip_no') else ''}"],
        [f"Bank: {slip.get('bank_name', '') or '-'}", f"Bank A/C: {slip.get('bank_account', '') or '-'}"]
    ]
    
    for row in details_grid:
        c.drawString(margin, y_pos, row[0])
        c.drawString(width/2 + 10, y_pos, row[1]) 
        y_pos -= 18
    
    y_pos -= 20
    
    # Create bordered sections like frontend
    section_height = 200
    box_width = (width - 2*margin - 20) / 2
    
    # EARNINGS section
    earnings_x = margin
    earnings_y = y_pos - section_height
    c.rect(earnings_x, earnings_y, box_width, section_height, stroke=1, fill=0)
    
    # DEDUCTIONS section  
    deductions_x = margin + box_width + 20
    deductions_y = y_pos - section_height
    c.rect(deductions_x, deductions_y, box_width, section_height, stroke=1, fill=0)
    
    # Section headers
    c.setFont("Helvetica-Bold", 12)
    c.drawString(earnings_x + 10, y_pos - 20, "EARNINGS")
    c.drawString(deductions_x + 10, y_pos - 20, "DEDUCTIONS")
    
    # Earnings items
    earnings_items = [
        ("Basic Salary", fmt(slip.get('basic_salary'))),
        ("House Allowance", fmt(slip.get('house_allowance'))),
        ("Transport Allowance", fmt(slip.get('transport_allowance'))),
        ("Other Allowances", fmt(slip.get('other_allowances'))),
        ("Commission", fmt(slip.get('commission'))),
        ("Bonus", fmt(slip.get('bonus'))),
        ("Non-Cash Benefit", fmt(slip.get('non_cash_benefit')))
    ]
    
    c.setFont("Helvetica", 10)
    item_y = y_pos - 45
    for label, value in earnings_items:
        c.drawString(earnings_x + 10, item_y, label)
        c.drawRightString(earnings_x + box_width - 10, item_y, value)
        item_y -= 15
    
    # GROSS PAY
    item_y -= 5
    c.setFont("Helvetica-Bold", 11)
    c.drawString(earnings_x + 10, item_y, "GROSS PAY")
    c.drawRightString(earnings_x + box_width - 10, item_y, fmt(slip.get('gross_pay')))
    
    # Deductions items
    deductions_before_tax = (slip.get('nssf') or 0) + (slip.get('shif') or 0) + (slip.get('ahl') or 0)
    deductions_after_tax = (slip.get('loan') or 0) + (slip.get('advance') or 0)
    
    deductions_items = [
        ("N.S.S.F.", fmt(slip.get('nssf'))),
        ("S.H.I.F.", fmt(slip.get('shif'))),
        ("A.H.L.", fmt(slip.get('ahl'))),
        ("Total Deductions Before Tax", fmt(deductions_before_tax)),
        ("Taxable Pay", fmt(slip.get('taxable_pay'))),
        ("P.A.Y.E.", fmt(slip.get('paye'))),
        ("Loan", fmt(slip.get('loan'))),
        ("Advance", fmt(slip.get('advance'))),
        ("Total Deductions After Tax", fmt(deductions_after_tax))
    ]
    
    c.setFont("Helvetica", 10)
    item_y = y_pos - 45
    for label, value in deductions_items:
        if "Total" in label:
            c.setFont("Helvetica-Bold", 10)
        c.drawString(deductions_x + 10, item_y, label)
        c.drawRightString(deductions_x + box_width - 10, item_y, value)
        if "Total" in label:
            c.setFont("Helvetica", 10)
        item_y -= 15
    
    # NET PAY - large and centered like frontend
    net_y = earnings_y - 40
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width/2, net_y, f"NET PAY: {fmt(slip.get('net_pay'))}")
    
    # Footer with stamp and date like frontend
    footer_y = net_y - 50
    
    # Draw stamp if exists
    stamp_path = company.get('stamp_file_path', '')
    if stamp_path and os.path.exists(stamp_path):
        try:
            c.drawImage(stamp_path, margin, footer_y - 30, width=40, height=40, preserveAspectRatio=True)
        except:
            pass
    
    # Created date
    c.setFont("Helvetica", 8)
    c.drawString(margin + 60, footer_y, f"Created: {slip.get('created', '')}")
    
    # Company footer
    if company.get('footer'):
        c.setFont("Helvetica", 8)
        c.drawCentredString(width/2, footer_y - 50, company.get('footer', ''))
    
    c.save()
    print("✅ Frontend-style PDF created successfully!")
    return buf.getvalue()

def create_enhanced_reportlab_pdf(slip: dict, password: str | None = None) -> bytes:
    """Create a ReportLab PDF with improved formatting that mimics the frontend layout"""
    print("📄 Creating enhanced ReportLab PDF with frontend-style layout...")
    
    buf = io.BytesIO()
    encrypt = StandardEncryption(password) if password else None
    c = canvas.Canvas(buf, pagesize=A4, encrypt=encrypt)
    
    # Use the exact same data structure as frontend
    def fmt(value):
        if value is None or value == 0:
            return "0.00"
        return f"{float(value):,.2f}"
    
    # Page setup
    width, height = A4
    margin = 50
    y_pos = height - 80
    
    # Company Header
    company = slip.get('company', {})
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width/2, y_pos, company.get('name', ''))
    y_pos -= 30
    
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width/2, y_pos, f"Payslip for the month of {slip.get('month_text', '')}")
    y_pos -= 40
    
    # Employee Details in grid format (like frontend)
    c.setFont("Helvetica", 10)
    details = [
        ("Name:", slip.get('name', ''), "Staff No:", slip.get('staff_no', '')),
        ("Job Title:", slip.get('job_title', '') or '-', "Email:", slip.get('email', '') or '-'),
        ("Pay Period:", slip.get('period', '')[:10] if slip.get('period') else '', 
         "Payslip No:", f"SLIP{str(slip.get('slip_no', '')).replace('SLIP', '').zfill(4) if slip.get('slip_no') else ''}"),
        ("Bank:", slip.get('bank_name', '') or '-', "Bank A/C:", slip.get('bank_account', '') or '-')
    ]
    
    for row in details:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(margin, y_pos, row[0])
        c.setFont("Helvetica", 10)
        c.drawString(margin + 80, y_pos, str(row[1]))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(width/2 + 20, y_pos, row[2])
        c.setFont("Helvetica", 10)
        c.drawString(width/2 + 100, y_pos, str(row[3]))
        y_pos -= 20
    
    y_pos -= 20
    
    # Earnings and Deductions side by side
    col1_x = margin
    col2_x = width/2 + 20
    col_width = width/2 - 70
    
    # EARNINGS
    c.setFont("Helvetica-Bold", 12)
    c.drawString(col1_x, y_pos, "EARNINGS")
    c.drawString(col2_x, y_pos, "DEDUCTIONS")
    y_pos -= 25
    
    earnings_y = y_pos
    deductions_y = y_pos
    
    # Earnings items
    earnings = [
        ("Basic Salary", fmt(slip.get('basic_salary'))),
        ("House Allowance", fmt(slip.get('house_allowance'))),
        ("Transport Allowance", fmt(slip.get('transport_allowance'))),
        ("Other Allowances", fmt(slip.get('other_allowances'))),
        ("Commission", fmt(slip.get('commission'))),
        ("Bonus", fmt(slip.get('bonus'))),
        ("Non-Cash Benefit", fmt(slip.get('non_cash_benefit')))
    ]
    
    c.setFont("Helvetica", 10)
    for label, value in earnings:
        c.drawString(col1_x, earnings_y, label)
        c.drawRightString(col1_x + col_width, earnings_y, value)
        earnings_y -= 15
    
    # GROSS PAY
    earnings_y -= 5
    c.setFont("Helvetica-Bold", 11)
    c.drawString(col1_x, earnings_y, "GROSS PAY")
    c.drawRightString(col1_x + col_width, earnings_y, fmt(slip.get('gross_pay')))
    
    # Deductions items
    deductions_before_tax = (slip.get('nssf') or 0) + (slip.get('shif') or 0) + (slip.get('ahl') or 0)
    deductions_after_tax = (slip.get('loan') or 0) + (slip.get('advance') or 0)
    
    deductions = [
        ("N.S.S.F.", fmt(slip.get('nssf'))),
        ("S.H.I.F.", fmt(slip.get('shif'))),
        ("A.H.L.", fmt(slip.get('ahl'))),
        ("Total Deductions Before Tax", fmt(deductions_before_tax)),
        ("Taxable Pay", fmt(slip.get('taxable_pay'))),
        ("P.A.Y.E.", fmt(slip.get('paye'))),
        ("Loan", fmt(slip.get('loan'))),
        ("Advance", fmt(slip.get('advance'))),
        ("Total Deductions After Tax", fmt(deductions_after_tax))
    ]
    
    c.setFont("Helvetica", 10)
    for label, value in deductions:
        if "Total" in label:
            c.setFont("Helvetica-Bold", 10)
        c.drawString(col2_x, deductions_y, label)
        c.drawRightString(col2_x + col_width, deductions_y, value)
        if "Total" in label:
            c.setFont("Helvetica", 10)
        deductions_y -= 15
    
    # NET PAY (centered, large)
    y_pos = min(earnings_y, deductions_y) - 30
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width/2, y_pos, f"NET PAY: {fmt(slip.get('net_pay'))}")
    
    # Footer
    y_pos -= 60
    c.setFont("Helvetica", 8)
    c.drawString(margin, y_pos, f"Created: {slip.get('created', '')}")
    
    # Company footer
    if company.get('footer'):
        y_pos -= 30
        c.drawCentredString(width/2, y_pos, company.get('footer', ''))
    
    c.save()
    return buf.getvalue()

def generate_payslip_pdf_bytes(slip: dict, password: str | None = None) -> bytes:
    buf = io.BytesIO()
    encrypt = StandardEncryption(password) if password else None
    c = canvas.Canvas(buf, pagesize=A4, encrypt=encrypt)
    _draw_payslip_on_canvas(c, slip)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()

def _send_email_with_attachment(to_email: str, subject: str, body: str, filename: str, data: bytes):
    """Send email with PDF attachment"""
    
    # Check if email is configured
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    
    if not smtp_user or not smtp_pass:
        raise Exception("""
📧 EMAIL NOT CONFIGURED 
To enable email functionality:

1. Create a .env file in the AccountingSystem folder
2. Add these settings:
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM=your-email@gmail.com

For Gmail: Enable 2FA and generate an App Password
See .env.example for more details.
        """)
    
    print(f"📧 Sending payslip email to {to_email}")
    
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ.get("SMTP_FROM", smtp_user)
    msg["To"] = to_email
    msg.set_content(body)
    msg.add_attachment(data, maintype="application", subtype="pdf", filename=filename)

    try:
        smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.environ.get("SMTP_PORT", "465"))
        
        with smtplib.SMTP_SSL(smtp_host, smtp_port) as s:
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
            print(f"✅ Email sent successfully to {to_email}")
            
    except Exception as e:
        print(f"❌ Email sending failed: {e}")
        raise Exception(f"Failed to send email: {str(e)}")


@router.get("/test-pdf-endpoint")
def test_pdf_endpoint():
    print("=== PDF TEST ENDPOINT CALLED ===")
    return {"message": "PDF endpoint is working", "timestamp": _dt.datetime.now().isoformat()}

@router.get("/payslips/{payroll_id}/pdf")
def get_payslip_pdf(payroll_id: int, password_mode: str | None = "id_number", db: Session = Depends(get_db)):
    try:
        print(f"\n=== PDF GENERATION STARTED ===")
        print(f"Payroll ID: {payroll_id}")
        print(f"Password mode: {password_mode}")
        
        slip = _fetch_slip_payload(db, payroll_id)
        print(f"Slip data keys: {list(slip.keys())}")
        
        pwd = None
        if password_mode == "id_number" and slip.get("employee_id_number"):
            pwd = str(slip["employee_id_number"]).strip()
        # If a password is requested we require PyPDF2 to be installed so the
        # HTML->PDF output can be wrapped/encrypted without falling back to an
        # unprotected WeasyPrint result. Refuse the request when encryption is
        # requested but PyPDF2 is not available so we don't accidentally leak
        # unprotected payslips.
        if pwd and not _HAS_PYPDF2:
            raise HTTPException(status_code=500, detail="Password-protected PDF requested but server is missing the 'PyPDF2' package. Install PyPDF2 in the backend environment to enable encrypted HTML->PDF generation.")

        print(f"About to render PDF...")
        # Render HTML -> PDF (weasyprint) and optionally encrypt with employee id
        print(f"Calling render_pdf_bytes_from_html...")
        pdf_bytes = render_pdf_bytes_from_html(slip, pwd)
        print(f"PDF generation complete. Size: {len(pdf_bytes)} bytes")
        
        filename = f"{slip['staff_no']}_{slip['period']}_payslip.pdf"
        print(f"=== PDF GENERATION FINISHED ===\n")
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        })
    except Exception as e:
        print(f"ERROR in get_payslip_pdf: {str(e)}")
        print(f"ERROR type: {type(e)}")
        import traceback
        print(f"ERROR traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.post("/payslips/{payroll_id}/email")
def email_single_payslip(payroll_id: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Send payslip via email with password-protected PDF attachment"""
    
    print(f"📧 === EMAIL PAYSLIP REQUEST ===")
    print(f"Payroll ID: {payroll_id}")
    
    # Check email configuration first
    if not os.environ.get("SMTP_USER") or not os.environ.get("SMTP_PASS"):
        raise HTTPException(
            status_code=500, 
            detail="Email not configured. Please set up SMTP settings in .env file. See .env.example for guidance."
        )
    
    slip = _fetch_slip_payload(db, payroll_id)
    employee_email = slip.get("email")
    
    if not employee_email:
        raise HTTPException(status_code=400, detail=f"Employee {slip.get('name')} has no email address")
    
    print(f"Employee: {slip.get('name')} ({slip.get('staff_no')})")
    print(f"Email: {employee_email}")
    
    # Generate password-protected PDF
    pwd = str(slip.get("employee_id_number", "")).strip() or None
    if pwd and not _HAS_PYPDF2:
        raise HTTPException(status_code=500, detail="PyPDF2 required for password-protected email attachments")

    print(f"Generating password-protected PDF...")
    pdf_bytes = render_pdf_bytes_from_html(slip, pwd)
    
    # Email details using the new format
    filename = f"Payslip_{slip['staff_no']}_{slip['period'][:7]}.pdf"
    
    # Extract month and year from month_text (e.g., "April 2025")
    month_text = slip.get('month_text', '')
    if month_text:
        # Split "April 2025" into "April" and "2025"
        parts = month_text.split()
        month = parts[0] if len(parts) > 0 else month_text
        year = parts[1] if len(parts) > 1 else ""
    else:
        month = ""
        year = ""
    
    # Subject: Your Payslip – {{MONTH}} {{YEAR}}
    subject = f"Your Payslip – {month} {year}".strip()
    
    # Clean email body using the specified format
    body = f"""Hello {slip['name']},

Attached is your payslip for {month} {year}.
Please use your National ID to open the document.

If you have any questions, feel free to reach out.

Warm regards,
{slip.get('company', {}).get('name', 'HR Department')}"""

    print(f"Queueing email to {employee_email}...")
    background.add_task(_send_email_with_attachment, employee_email, subject, body, filename, pdf_bytes)
    
    return {
        "status": "Email queued successfully", 
        "to": employee_email,
        "subject": subject,
        "attachment": filename
    }


@router.post("/{period}/payslips/email-bulk")
def email_bulk_payslips(period: str, background: BackgroundTasks, db: Session = Depends(get_db)):
    # normalize period as earlier
    if isinstance(period, str) and len(period) == 7 and period.count('-') == 1:
        period_norm = f"{period}-01"
    else:
        period_norm = period
    try:
        from datetime import date as _date
        period_date = _date.fromisoformat(period_norm)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid period format. Use YYYY-MM or YYYY-MM-DD.")

    rows = db.query(PayrollModel).filter(PayrollModel.period == period_date).all()
    queued = 0
    for payroll in rows:
        try:
            slip = _fetch_slip_payload(db, payroll.id)
            if not slip.get("email"):
                continue
            pwd = str(slip.get("employee_id_number", "")).strip() or None
            if pwd and not _HAS_PYPDF2:
                raise HTTPException(status_code=500, detail="Password-protected PDF requested but server is missing the 'PyPDF2' package. Install PyPDF2 in the backend environment to enable encrypted HTML->PDF generation.")
            pdf_bytes = render_pdf_bytes_from_html(slip, pwd)
            filename = f"{slip['staff_no']}_{slip['period']}_payslip.pdf"
            subject = f"Payslip — {slip['month_text']} — {slip['staff_no']}"
            password_note = f"\nPassword: your National ID ({slip.get('employee_id_number')})" if pwd else ""
            body = f"Dear {slip['name']},\n\nPlease find attached your payslip for {slip['month_text']}.\n{password_note}\n\nRegards,\n{slip.get('company', {}).get('name','')}"
            background.add_task(_send_email_with_attachment, slip["email"], subject, body, filename, pdf_bytes)
            queued += 1
        except Exception:
            continue
    return {"status": "queued", "count": queued}


@router.post("/recompute")
def recompute_period_payrolls(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Recompute NSSF, PAYE and net pay for all payroll rows in a given period.

    POST body: {"period": "YYYY-MM" or "YYYY-MM-DD", "confirm": true}
    Requires explicit confirm flag to avoid accidental mass changes.
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    period = payload.get('period')
    confirm = bool(payload.get('confirm'))
    if not period:
        raise HTTPException(status_code=400, detail="Missing 'period' in request body")
    if not confirm:
        raise HTTPException(status_code=400, detail='Must include {"confirm": true} to proceed')

    # normalize period strings like '2025-01' -> '2025-01-01'
    if isinstance(period, str) and len(period) == 7 and period.count('-') == 1:
        period_norm = f"{period}-01"
    else:
        period_norm = period

    try:
        from datetime import date as _date
        period_date = _date.fromisoformat(period_norm)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid period format. Use YYYY-MM or YYYY-MM-DD.")

    payrolls = db.query(PayrollModel).filter(PayrollModel.period == period_date).all()
    if not payrolls:
        raise HTTPException(status_code=404, detail="No payroll records found for the selected period")

    results = []
    for p in payrolls:
        # compute gross from stored components (in case stored gross is stale)
        try:
            non_cash = float(getattr(p, 'non_cash_benefit', 0) or 0)
        except Exception:
            non_cash = 0
        # Gross pay = cash earnings only (employee actually receives this)
        gross = (
            (p.basic_salary or 0) + (p.house_allowance or 0) + (p.transport_allowance or 0) +
            (p.other_allowances or 0) + (p.commission or 0) + (p.bonus or 0)
        )
        
        # Taxable pay = cash earnings + non-cash benefits (for PAYE calculation)
        taxable_base = gross + non_cash

        # Recompute statutory deductions respecting each employee's flags.
        try:
            # NSSF, SHIF, AHL use gross pay; PAYE uses taxable_base (includes non-cash benefits)
            ahl, shif, nssf, paye, taxable, nssf_employer = compute_statutories(db, p.employee, gross, p.period)
            
            # Recalculate PAYE using taxable_base (gross + non_cash_benefit)
            if taxable_base != gross:
                taxable_with_ncb = taxable_base - ahl - shif - nssf
                def calculate_paye(taxable):
                    if taxable <= 24000:
                        tax = taxable * 0.1
                    elif taxable <= 32333:
                        tax = (24000 * 0.1) + ((taxable - 24000) * 0.25)
                    else:
                        tax = (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3)
                    return max(tax - 2400, 0)
                paye = calculate_paye(taxable_with_ncb)
                taxable = taxable_with_ncb
        except Exception:
            # Fallback to legacy calculation if something goes wrong
            # AHL, SHIF, NSSF calculated from gross pay only
            ahl = gross * 0.015
            shif = 1700 if p.period < date(2024, 7, 1) else max(gross * 0.0275, 300)
            try:
                nssf, nssf_employer = resolve_nssf(db, p.period, gross)
            except Exception:
                nssf, nssf_employer = 0, 0
            # PAYE calculated from taxable_base (includes non-cash benefits)
            taxable = taxable_base - ahl - shif - nssf
            def _calc(t):
                if t <= 24000:
                    tax = t * 0.1
                elif t <= 32333:
                    tax = (24000 * 0.1) + ((t - 24000) * 0.25)
                else:
                    tax = (24000 * 0.1) + (8333 * 0.25) + ((t - 32333) * 0.3)
                return max(tax - 2400, 0)
            paye = _calc(taxable)
            net_pay = gross - (ahl + shif + nssf + paye + (p.loan or 0) + (p.advance or 0))
        else:
            net_pay = gross - (ahl + shif + nssf + paye + (p.loan or 0) + (p.advance or 0))

        old = {"id": p.id, "nssf": p.nssf, "paye": p.paye, "net_pay": p.net_pay, "nita_employer": p.nita_employer}

        p.gross_pay = round(gross, 2)
        p.taxable_pay = round(taxable, 2)  # This is taxable income after deductions
        p.shif = round(shif, 2)
        p.nssf = round(nssf, 2)
        p.paye = round(paye, 2)
        p.ahl = round(ahl, 2)
        p.net_pay = round(net_pay, 2)
        p.ahl_employer = round(ahl, 2)
        p.nssf_employer = round(nssf_employer, 2)
        
        # NITA employer contribution - exempt for interns
        employment_type_val = (getattr(p.employee, 'employment_type', None) or "").strip().lower()
        p.nita_employer = 0 if 'intern' in employment_type_val else 50

        setting_meta = None
        if setting:
            try:
                setting_meta = {"id": setting.id, "start_date": setting.start_date, "end_date": setting.end_date}
            except Exception:
                setting_meta = None

        results.append({
            "id": p.id,
            "old": old,
            "new": {"nssf": p.nssf, "paye": p.paye, "net_pay": p.net_pay, "nita_employer": p.nita_employer},
            "nssf_setting_used": setting_meta
        })

    db.commit()
    return {"updated": len(results), "details": results}

@router.put("/{period}/details/{payroll_id}", response_model=PayrollDetailSchema)
def edit_payroll_detail(period: date, payroll_id: int, detail: PayrollDetailSchema, db: Session = Depends(get_db)):
    payroll = db.query(PayrollModel).filter(PayrollModel.id == payroll_id, PayrollModel.period == period).first()
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll entry not found")

    # Update earning fields
    payroll.basic_salary = detail.basic_salary
    payroll.house_allowance = detail.house_allowance
    payroll.transport_allowance = detail.transport_allowance
    payroll.other_allowances = detail.other_allowances
    payroll.commission = detail.commission
    payroll.bonus = detail.bonus
    payroll.non_cash_benefit = getattr(detail, 'non_cash_benefit', 0) or 0
    payroll.loan = detail.loan
    payroll.advance = detail.advance

    # Recalculate gross and other values
    # Gross pay = cash earnings only (employee actually receives this)
    gross = (
        payroll.basic_salary +
        payroll.house_allowance +
        payroll.transport_allowance +
        payroll.other_allowances +
        payroll.commission +
        payroll.bonus
    )
    
    # Taxable pay = cash earnings + non-cash benefits (for PAYE calculation)
    taxable_base = gross + (payroll.non_cash_benefit or 0)
    payroll.gross_pay = gross

    # Respect employee flags when recalculating this payroll row
    try:
        # NSSF, SHIF, AHL use gross pay; PAYE uses taxable_base (includes non-cash benefits)
        ahl, shif, nssf, paye, taxable, nssf_employer = compute_statutories(db, payroll.employee, gross, payroll.period)
        
        # Always recalculate PAYE using taxable_base (gross + non_cash_benefit)
        # Taxable income after statutory deductions (but before PAYE)
        taxable_for_paye = taxable_base - ahl - shif - nssf
        def calculate_paye(taxable):
            if taxable <= 24000:
                tax = taxable * 0.1
            elif taxable <= 32333:
                tax = (24000 * 0.1) + ((taxable - 24000) * 0.25)
            else:
                tax = (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3)
            return max(tax - 2400, 0)
        paye = calculate_paye(taxable_for_paye)
        
        payroll.nssf = nssf
        payroll.ahl = ahl
        payroll.shif = shif
        payroll.nssf_employer = nssf_employer
        payroll.paye = paye
        payroll.taxable_pay = round(taxable_for_paye, 2)  # Taxable income after statutory deductions
        payroll.net_pay = gross - (ahl + shif + nssf + paye + payroll.loan + payroll.advance)
    except Exception:
        # fallback to legacy behaviour
        # AHL, SHIF, NSSF calculated from gross pay (cash earnings only)
        ahl = gross * 0.015
        shif = 1700 if payroll.period < date(2024, 7, 1) else max(gross * 0.0275, 300)
        try:
            nssf, nssf_employer = resolve_nssf(db, payroll.period, gross)
        except Exception:
            nssf, nssf_employer = 0, 0
        payroll.nssf = nssf
        payroll.ahl = ahl
        payroll.shif = shif
        payroll.nssf_employer = nssf_employer
        # PAYE calculated from taxable_base (includes non-cash benefits)
        taxable = taxable_base - ahl - shif - nssf
        def _calc(t):
            if t <= 24000:
                tax = t * 0.1
            elif t <= 32333:
                tax = (24000 * 0.1) + ((t - 24000) * 0.25)
            else:
                tax = (24000 * 0.1) + (8333 * 0.25) + ((t - 32333) * 0.3)
            return max(tax - 2400, 0)
        payroll.paye = _calc(taxable)
        payroll.taxable_pay = round(taxable, 2)  # Update taxable_pay with correct value
        payroll.net_pay = gross - (ahl + shif + nssf + payroll.paye + payroll.loan + payroll.advance)

    payroll.ahl_employer = ahl
    payroll.nssf_employer = nssf
    
    # NITA employer contribution - exempt for interns
    employment_type_val = (getattr(payroll.employee, 'employment_type', None) or "").strip().lower()
    payroll.nita_employer = 0 if 'intern' in employment_type_val else 50

    # Sync loan/advance deductions to loan_repayments table
    # This ensures that when payroll is edited, the loan_repayments are updated accordingly
    _apply_payroll_to_loans(db, payroll.employee_id, payroll.period, payroll.id, payroll.loan or 0, payroll.advance or 0)

    db.commit()
    db.refresh(payroll)
    employee = payroll.employee

    return PayrollDetailSchema(
        id=payroll.id,
        job_title=employee.job_title,
        staff_no=employee.staff_no,
        name=employee.name,
        basic_salary=payroll.basic_salary,
        house_allowance=payroll.house_allowance,
        transport_allowance=payroll.transport_allowance,
        other_allowances=payroll.other_allowances,
        commission=payroll.commission,
        bonus=payroll.bonus,
        gross_pay=payroll.gross_pay,
        taxable_pay=payroll.taxable_pay,
        nssf=payroll.nssf,
        shif=payroll.shif,
        ahl=payroll.ahl,
        paye=payroll.paye,
        non_cash_benefit=getattr(payroll, 'non_cash_benefit', 0) or 0,
        loan=payroll.loan,
        advance=payroll.advance,
        net_pay=payroll.net_pay,
        ahl_employer=payroll.ahl_employer,
        nssf_employer=payroll.nssf_employer,
        nita_employer=payroll.nita_employer,
        bank_name=employee.bank_name,
        bank_account=employee.bank_account,
        branch_name=employee.branch_name,
        branch_code=employee.branch_code,
        nssf_number=employee.nssf_number,
        nhif_number=employee.nhif_number,
        kra_pin=employee.kra_pin,
        email=employee.personal_email if getattr(employee, 'personal_email', None) else getattr(employee, 'email', None),
        phone=getattr(employee, 'phone', None),
        id_number=getattr(employee, 'id_number', None),
    )

@router.delete("/{period}/details/{payroll_id}")
def delete_payroll_detail(period: date, payroll_id: int, db: Session = Depends(get_db)):
    payroll = db.query(PayrollModel).filter(PayrollModel.id == payroll_id, PayrollModel.period == period).first()
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll entry not found")
    db.delete(payroll)
    db.commit()
    return {"message": "Payroll entry deleted"}


@router.delete("/{period}")
def delete_payroll_period(period: date, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Delete all payroll records for a given period.

    Requires JSON body: {"confirm": true} to proceed. This prevents accidental deletes.
    Returns the number of deleted rows.
    """
    confirm = bool(payload.get("confirm")) if isinstance(payload, dict) else False
    if not confirm:
        raise HTTPException(status_code=400, detail="Must include {\"confirm\": true} in request body to delete period")

    deleted = db.query(PayrollModel).filter(PayrollModel.period == period).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}

# NOTE: Removed an extra/misprefixed duplicate endpoint that used the
# "payrolls/{period}/details" path (which would expand to /payrolls/payrolls/{period}/details
# because the router has prefix "/payrolls"). The canonical period details
# endpoint is defined at @router.get("/{period}/details") earlier in this file.

@router.get("/{period}/details/{payroll_id}", response_model=PayrollDetailSchema)
def get_payroll_detail(period: str, payroll_id: int, db: Session = Depends(get_db)):
    payroll = db.query(PayrollModel).filter(
        PayrollModel.period == period,
        PayrollModel.id == payroll_id
    ).first()
    if not payroll:
        raise HTTPException(status_code=404, detail="Payslip not found")
    employee = payroll.employee

    return PayrollDetailSchema(
        id=payroll.id,
        job_title=employee.job_title,
        staff_no=employee.staff_no,
        name=employee.name,
        basic_salary=payroll.basic_salary,
        house_allowance=payroll.house_allowance,
        transport_allowance=payroll.transport_allowance,
        other_allowances=payroll.other_allowances,
        commission=payroll.commission,
        bonus=payroll.bonus,
        gross_pay=payroll.gross_pay,
        taxable_pay=payroll.taxable_pay,
        nssf=payroll.nssf,
        shif=payroll.shif,
        ahl=payroll.ahl,
        paye=payroll.paye,
        loan=payroll.loan,
        advance=payroll.advance,
        net_pay=payroll.net_pay,
        ahl_employer=payroll.ahl_employer,
        nssf_employer=payroll.nssf_employer,
        nita_employer=payroll.nita_employer,
        # Add any other deduction/earning fields you have
    )

@router.delete("/{period}/batch-delete")
def batch_delete_payroll_details(period: date, payload: dict = Body(...), db: Session = Depends(get_db)):
    """Batch delete payroll entries for a period.

    Expects JSON body: {"payroll_ids": [1,2,3], "confirm": true}
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    payroll_ids = payload.get("payroll_ids") or payload.get("ids") or []
    confirm = bool(payload.get("confirm"))
    if not confirm:
        raise HTTPException(status_code=400, detail="Must include {\"confirm\": true} in request body to delete payrolls")
    if not isinstance(payroll_ids, list) or not payroll_ids:
        raise HTTPException(status_code=400, detail="payroll_ids must be a non-empty list of ids")

    deleted = db.query(PayrollModel).filter(
        PayrollModel.period == period,
        PayrollModel.id.in_(payroll_ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}

@router.get("/active-employees/{period}")
def get_active_employees(period: date, db: Session = Depends(get_db)):
    # Only employees employed on or before the period and not left before the period
    employees = db.query(models.Employee).filter(
        models.Employee.date_of_employment <= period,
        (models.Employee.termination_date == None) | (models.Employee.termination_date > period)
    ).all()
    out = []
    period_ym = period.strftime("%Y-%m")
    for e in employees:
        loan_sum = 0.0
        advance_sum = 0.0
        loan_due = 0.0
        advance_due = 0.0

        # Collect loans and compute both full balances and the installment due this month
        try:
            loans = db.query(models.LoanAdvance).filter(
                models.LoanAdvance.employee_id == e.id,
                models.LoanAdvance.balance_outstanding > 0
            ).all()
        except Exception:
            loans = []

        for ln in loans:
            try:
                lt = (ln.loan_type or "").lower()
            except Exception:
                lt = ""

            bal = float(getattr(ln, "balance_outstanding", 0) or 0)
            inst = float(getattr(ln, "installment_amount", 0) or 0)

            # If schedule exists, try the exact period row
            due_this = inst
            try:
                sch = ln.schedule or []
                match = next((r for r in sch if str(r.get("period_ym")) == period_ym and not r.get("paid", False)), None)
                if match:
                    due_this = float(match.get("installment") or match.get("principal") or inst or 0)
            except Exception:
                pass

            if "advance" in lt:
                advance_sum += bal
                if advance_due == 0 and due_this > 0:
                    advance_due = due_this
            else:
                loan_sum += bal
                if loan_due == 0 and due_this > 0:
                    loan_due = due_this

        # non-cash benefits (kept as you had)
        try:
            non_cash_sum = db.query(func.coalesce(func.sum(models.EmployeeNonCashBenefit.amount), 0)).filter(
                models.EmployeeNonCashBenefit.staff_no == e.staff_no,
                models.EmployeeNonCashBenefit.period == period,
                models.EmployeeNonCashBenefit.is_applied == False
            ).scalar() or 0
        except Exception:
            non_cash_sum = 0

        out.append({
            "id": e.id,
            "staff_no": e.staff_no,
            "name": e.name,
            "date_of_employment": e.date_of_employment,
            "termination_date": e.termination_date,
            "basic_salary": e.basic_salary,
            "house_allowance": e.house_allowance,
            "transport_allowance": e.transport_allowance,
            "other_allowances": e.other_allowances,
            "commission": e.commission,
            "bonus": e.bonus,
            # totals (for display)
            "loan": round(loan_sum, 2),
            "advance": round(advance_sum, 2),
            # due this month (for payroll prefill)
            "loan_due": round(loan_due, 2),
            "advance_due": round(advance_due, 2),
            "non_cash_benefit": float(non_cash_sum or 0),
        })
    return out

def calculate_payroll(employee):
    gross_pay = employee.basic_salary or 0

    # Example contribution rates
    shif_rate = 0.015  # 1.5%
    nssf_rate = 200    # fixed amount
    housing_levy_rate = 0.015  # 1.5%

    deductions = {}

    if getattr(employee, "deduct_shif", False):
        deductions["SHIF"] = round(gross_pay * shif_rate, 2)
    if getattr(employee, "deduct_nssf", False):
        deductions["NSSF"] = nssf_rate
    if getattr(employee, "deduct_housing_levy", False):
        deductions["Housing Levy"] = round(gross_pay * housing_levy_rate, 2)

    net_pay = gross_pay - sum(deductions.values())

    return {
        "gross_pay": gross_pay,
        "deductions": deductions,
        "net_pay": net_pay
    }

def process_payroll_for_employee(employee, payroll, db):
    # ...your payroll calculation logic...

    # After payroll calculation and deduction
    advance = db.query(models.EmployeeAdvance).filter(
        models.EmployeeAdvance.employee_id == employee.id,
        models.EmployeeAdvance.balance > 0
    ).first()
    if advance:
        advance.amount_repaid += payroll.advance
        advance.balance -= payroll.advance
        advance.last_deduction_date = payroll.period
        advance.payslip_number = get_payslip_number(payroll.id, payroll.period)
        if advance.balance <= 0:
            advance.status = "Cleared"
        db.commit()

    # ...rest of your payroll logic...

def _apply_payroll_to_loans(db: Session, employee_id: int, period_date, payslip_id: int, loan_amount: float, advance_amount: float):
    """
    Apply payroll loan/advance deductions to loan_advances and create/update loan_repayments.
    
    IMPORTANT: This function recalculates the ENTIRE loan state from scratch using FIFO
    to handle mid-period edits correctly. When you edit a payslip in the middle,
    it rebuilds all loan balances chronologically.
    """
    from datetime import date as _date
    from sqlalchemy import text
    
    # Convert period_date to YYYY-MM format for loan_repayments.period_ym
    if isinstance(period_date, _date):
        period_ym = period_date.strftime('%Y-%m')
        paid_on_date = period_date
    else:
        # Handle string dates
        if isinstance(period_date, str):
            parsed_date = _date.fromisoformat(period_date if len(period_date) > 7 else f"{period_date}-01")
            period_ym = parsed_date.strftime('%Y-%m')
            paid_on_date = parsed_date
        else:
            period_ym = str(period_date)[:7]  # fallback
            paid_on_date = _date.fromisoformat(f"{period_ym}-01")
    
    # For mid-period edits, we need to recalculate from scratch to maintain FIFO
    # Check if this is an edit (existing payroll record) vs new payroll
    current_payroll = db.execute(text("""
        SELECT advance, loan FROM payrolls 
        WHERE employee_id = :emp_id AND period = :period
    """), {"emp_id": employee_id, "period": period_date}).fetchone()
    
    is_edit = current_payroll is not None
    
    if is_edit:
        # This is an edit - we need to recalculate the entire loan state
        # to ensure FIFO is maintained across all periods
        _recalculate_all_loans_fifo(db, employee_id)
        return  # Exit early - full recalculation handles everything
    
    # For new payrolls, continue with incremental logic
    
    # Find open loan advances for this employee (balance_outstanding > 0)
    # Order by date_issued ASC to ensure oldest loans are paid first
    open_loans = db.execute(text("""
        SELECT id, reference_no, loan_type, balance_outstanding, installment_amount, date_issued
        FROM loan_advances 
        WHERE employee_id = :emp_id AND balance_outstanding > 0 
        ORDER BY date_issued ASC, id ASC
    """), {"emp_id": employee_id}).fetchall()
    
    # Process advance deductions first, then loans using FIFO (First In, First Out)
    # FIFO means: completely clear the oldest loan before moving to the next loan
    total_to_apply = advance_amount + loan_amount
    
    for loan_row in open_loans:
        if total_to_apply <= 0:
            break
            
        loan_id = loan_row[0]
        reference_no = loan_row[1]
        balance_outstanding = loan_row[3] or 0.0  # balance_outstanding is the 4th column (index 3)
        
        if balance_outstanding <= 0:
            continue
            
        # FIFO: Apply ALL available amount to this loan (oldest first)
        # Only move to next loan when this one is completely cleared OR no money left
        amount_to_apply = min(total_to_apply, balance_outstanding)
        
        # Update loan_advances balance and amount_repaid
        new_balance = balance_outstanding - amount_to_apply
        new_status = 'Cleared' if new_balance <= 0.001 else 'Active'  # Use small tolerance for float precision
        
        # Get current amount_repaid and update it
        current_repaid_result = db.execute(text("""
            SELECT amount_repaid FROM loan_advances WHERE id = :loan_id
        """), {"loan_id": loan_id})
        current_repaid = current_repaid_result.scalar() or 0.0
        new_amount_repaid = current_repaid + amount_to_apply
        
        db.execute(text("""
            UPDATE loan_advances 
            SET balance_outstanding = :new_balance, 
                amount_repaid = :amount_repaid,
                status = :status
            WHERE id = :loan_id
        """), {
            "new_balance": round(new_balance, 2), 
            "amount_repaid": round(new_amount_repaid, 2),
            "status": new_status, 
            "loan_id": loan_id
        })
        
        # Check if repayment already exists for this loan/period/payslip combination
        existing_repayment = db.execute(text("""
            SELECT id FROM loan_repayments 
            WHERE loan_id = :loan_id AND period_ym = :period_ym AND payslip_id = :payslip_id
        """), {
            "loan_id": loan_id,
            "period_ym": period_ym, 
            "payslip_id": payslip_id
        }).fetchone()
        
        if existing_repayment:
            # Update existing repayment
            db.execute(text("""
                UPDATE loan_repayments 
                SET amount = :amount, paid = 1, paid_on = :paid_on
                WHERE id = :repayment_id
            """), {
                "amount": round(amount_to_apply, 2),
                "paid_on": paid_on_date,
                "repayment_id": existing_repayment[0]
            })
        else:
            # Create new repayment record
            db.execute(text("""
                INSERT INTO loan_repayments 
                (loan_id, reference_no, period_ym, amount, paid, paid_on, payslip_id, created_at)
                VALUES (:loan_id, :ref_no, :period_ym, :amount, 1, :paid_on, :payslip_id, datetime('now'))
            """), {
                "loan_id": loan_id,
                "ref_no": reference_no,
                "period_ym": period_ym,
                "amount": round(amount_to_apply, 2),
                "paid_on": paid_on_date,
                "payslip_id": payslip_id
            })
        
        total_to_apply -= amount_to_apply
        
        # FIFO Logic: If this loan is now completely cleared (balance = 0), 
        # continue to next loan. If loan still has balance but we're out of money, stop.
        if new_balance > 0.001 and total_to_apply <= 0:
            # This loan still has balance but we're out of deduction money - stop here
            break
        # If new_balance <= 0, loan is cleared, continue to next loan with remaining amount
    
    db.commit()

def _recalculate_all_loans_fifo(db: Session, employee_id: int):
    """
    Recalculate ALL loan states for an employee from scratch using proper FIFO.
    
    This is used when editing payrolls to ensure FIFO is maintained correctly.
    Steps:
    1. Reset all loans to original principal amounts
    2. Get all payroll deductions chronologically  
    3. Apply FIFO across all periods in sequence
    """
    from sqlalchemy import text
    from datetime import date as _date
    
    print(f"🔄 Recalculating loans for employee {employee_id} using FIFO...")
    
    # Step 1: Reset all loans to original state
    db.execute(text("""
        UPDATE loan_advances 
        SET amount_repaid = 0, 
            balance_outstanding = principal_amount,
            status = 'Active'
        WHERE employee_id = :emp_id
    """), {"emp_id": employee_id})
    
    # Step 2: Delete all existing repayment records for clean rebuild
    db.execute(text("""
        DELETE FROM loan_repayments 
        WHERE loan_id IN (
            SELECT id FROM loan_advances WHERE employee_id = :emp_id
        )
    """), {"emp_id": employee_id})
    
    # Step 3: Get all payroll deductions chronologically
    payroll_deductions = db.execute(text("""
        SELECT period, advance, loan, id as payslip_id
        FROM payrolls 
        WHERE employee_id = :emp_id AND (advance > 0 OR loan > 0)
        ORDER BY period ASC
    """), {"emp_id": employee_id}).fetchall()
    
    if not payroll_deductions:
        print(f"   No deductions found for employee {employee_id}")
        return
    
    # Step 4: Get loans in FIFO order (oldest first)
    loans = db.execute(text("""
        SELECT id, reference_no, date_issued, principal_amount
        FROM loan_advances 
        WHERE employee_id = :emp_id
        ORDER BY date_issued ASC, id ASC
    """), {"emp_id": employee_id}).fetchall()
    
    print(f"   Processing {len(payroll_deductions)} payroll periods, {len(loans)} loans")
    
    # Step 5: Apply FIFO across all deductions chronologically
    loan_balances = {loan[0]: float(loan[3]) for loan in loans}  # loan_id -> remaining balance
    
    for period_row in payroll_deductions:
        period_date, advance, loan, payslip_id = period_row
        total_deduction = (advance or 0) + (loan or 0)
        
        if total_deduction <= 0:
            continue
        
        period_ym = period_date.strftime('%Y-%m') if isinstance(period_date, _date) else str(period_date)[:7]
        
        # Apply deduction to loans in FIFO order
        remaining_deduction = total_deduction
        
        for loan_row in loans:
            if remaining_deduction <= 0:
                break
                
            loan_id, ref_no, date_issued, principal = loan_row
            loan_balance = loan_balances.get(loan_id, 0)
            
            if loan_balance <= 0:
                continue  # This loan is already cleared
                
            # Apply as much as possible to this loan (FIFO)
            payment = min(remaining_deduction, loan_balance)
            
            # Update loan balance
            loan_balances[loan_id] = loan_balance - payment
            remaining_deduction -= payment
            
            # Create repayment record
            db.execute(text("""
                INSERT INTO loan_repayments 
                (loan_id, reference_no, period_ym, amount, paid, paid_on, payslip_id, created_at)
                VALUES (:loan_id, :ref_no, :period_ym, :amount, 1, :paid_on, :payslip_id, datetime('now'))
            """), {
                "loan_id": loan_id,
                "ref_no": ref_no,
                "period_ym": period_ym,
                "amount": round(payment, 2),
                "paid_on": f"{period_ym}-01",
                "payslip_id": payslip_id
            })
            
            print(f"   {period_ym}: KES {payment:,.0f} → {ref_no} (balance: {loan_balances[loan_id]:,.0f})")
    
    # Step 6: Update final loan states
    for loan_row in loans:
        loan_id, ref_no, date_issued, principal = loan_row
        final_balance = loan_balances.get(loan_id, 0)
        amount_repaid = principal - final_balance
        status = 'Cleared' if final_balance <= 0.01 else 'Active'
        
        db.execute(text("""
            UPDATE loan_advances 
            SET amount_repaid = :amount_repaid,
                balance_outstanding = :balance,
                status = :status
            WHERE id = :loan_id
        """), {
            "amount_repaid": round(amount_repaid, 2),
            "balance": round(max(0, final_balance), 2),
            "status": status,
            "loan_id": loan_id
        })
    
    db.commit()
    print(f"✅ Loan recalculation completed for employee {employee_id}")

@router.post("/{period}/sync-loan-repayments")
def sync_loan_repayments(period: str, db: Session = Depends(get_db)):
    """Retro-apply payroll deductions into loan/advance schedules for an existing period.

    Accepts YYYY-MM or YYYY-MM-DD. Returns number of payroll rows synced.
    """
    # normalize period
    if isinstance(period, str) and len(period) == 7 and period.count('-') == 1:
        period_norm = f"{period}-01"
    else:
        period_norm = period
    from datetime import date as _date
    try:
        period_date = _date.fromisoformat(period_norm)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid period format. Use YYYY-MM or YYYY-MM-DD.")

    rows = db.query(PayrollModel).filter(PayrollModel.period == period_date).all()
    fixed = 0
    for p in rows:
        if (p.loan or 0) > 0 or (p.advance or 0) > 0:
            _apply_payroll_to_loans(db, p.employee_id, p.period, p.id, p.loan or 0, p.advance or 0)
            fixed += 1
    return {"synced": fixed}

