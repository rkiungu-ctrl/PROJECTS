from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional
import io
from openpyxl import Workbook
from sqlalchemy import func
from calendar import monthrange

from database import get_db
import models
from models.payroll import Payroll as PayrollModel
from schemas.payroll import PayrollOut, CreatePayroll, PayrollSummary, PayrollDetailSchema, PayrollDetail
from models.journal import JournalEntry, JournalLine
from models.account import Account
from schemas.payslip import Payslip

router = APIRouter(
    prefix="/payrolls",
    tags=["Payroll"]
)

def prorate_salary(employee, payroll_period, salary):
    # If employed mid-month, prorate
    if employee.date_employed and employee.date_employed.month == payroll_period.month and employee.date_employed.year == payroll_period.year:
        days_in_month = monthrange(payroll_period.year, payroll_period.month)[1]
        start_day = employee.date_employed.day
        worked_days = days_in_month - start_day + 1
        return round((salary / days_in_month) * worked_days, 2)
    return salary

@router.post("/", response_model=PayrollOut)
def create_payroll(
    payroll: CreatePayroll,
    db: Session = Depends(get_db)
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == payroll.staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee with that staff number not found")

    gross = (
        payroll.basic_salary +
        payroll.house_allowance +
        payroll.transport_allowance +
        payroll.other_allowances +
        payroll.commission +
        payroll.bonus
    )

    ahl = gross * 0.015
    shif = 1700 if payroll.period < date(2024, 7, 1) else max(gross * 0.0275, 300)

    def calculate_nssf(gross):
        tier1 = min(gross, 8000) * 0.06
        tier2 = min(max(gross - 8000, 0), 64000) * 0.06
        return tier1 + tier2

    nssf = calculate_nssf(gross)
    ahl_employer = ahl
    nssf_employer = nssf
    nita_employer = 50

    taxable = gross - ahl - shif - nssf

    def calculate_paye(taxable):
        if taxable <= 24000:
            tax = taxable * 0.1
        elif taxable <= 32333:
            tax = (24000 * 0.1) + ((taxable - 24000) * 0.25)
        else:
            tax = (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3)
        return max(tax - 2400, 0)

    paye = calculate_paye(taxable)
    deductions = ahl + shif + nssf + paye + payroll.loan + payroll.advance
    net_pay = gross - deductions

    new_payroll = PayrollModel(
        employee_id=employee.id,
        period=payroll.period,
        basic_salary=payroll.basic_salary,
        house_allowance=payroll.house_allowance,
        transport_allowance=payroll.transport_allowance,
        other_allowances=payroll.other_allowances,
        commission=payroll.commission,
        bonus=payroll.bonus,
        gross_pay=round(gross, 2),
        taxable_pay=round(taxable, 2),
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
    return new_payroll


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


@router.post("/bulk", response_model=List[PayrollOut])
def create_bulk_payrolls(
    payrolls: List[CreatePayroll],
    db: Session = Depends(get_db)
):
    created_payrolls = []

    def calculate_nssf(gross):
        tier1 = min(gross, 8000) * 0.06
        tier2 = min(max(gross - 8000, 0), 64000) * 0.06
        return tier1 + tier2

    def calculate_paye(taxable):
        if taxable <= 24000:
            return taxable * 0.1
        elif taxable <= 32333:
            return (24000 * 0.1) + ((taxable - 24000) * 0.25)
        else:
            return (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3) - 2400

    for payroll in payrolls:
        employee = db.query(models.Employee).filter(models.Employee.staff_no == payroll.staff_no).first()
        if not employee:
            continue

        gross = (
            payroll.basic_salary + payroll.house_allowance +
            payroll.transport_allowance + payroll.other_allowances +
            payroll.commission + payroll.bonus
        )

        ahl = gross * 0.015
        shif = 1700 if payroll.period < date(2024, 7, 1) else max(gross * 0.0275, 300)
        nssf = calculate_nssf(gross)
        ahl_employer = ahl
        nssf_employer = nssf
        nita_employer = 50
        taxable = gross - ahl - shif - nssf
        paye = max(calculate_paye(taxable), 0)
        deductions = ahl + shif + nssf + paye + payroll.loan + payroll.advance
        net_pay = gross - deductions

        new_payroll = PayrollModel(
            employee_id=employee.id,
            period=payroll.period,
            basic_salary=payroll.basic_salary,
            house_allowance=payroll.house_allowance,
            transport_allowance=payroll.transport_allowance,
            other_allowances=payroll.other_allowances,
            commission=payroll.commission,
            bonus=payroll.bonus,
            gross_pay=round(gross, 2),
            taxable_pay=round(taxable, 2),
            shif=round(shif, 2),
            nssf=round(nssf, 2),
            paye=round(paye, 2),
            ahl=round(ahl, 2),
            loan=round(payroll.loan, 2),
            advance=round(payroll.advance, 2),
            net_pay=round(net_pay, 2),
            ahl_employer=round(ahl_employer, 2),
            nssf_employer=round(nssf_employer, 2),
            nita_employer=round(nita_employer, 2)
        )

        db.add(new_payroll)
        created_payrolls.append(new_payroll)

    db.commit()
    return created_payrolls


@router.post("/payrolls/{period}/post-to-journal")
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
    payroll.loan = detail.loan
    payroll.advance = detail.advance

    # Recalculate gross and other values
    gross = (
        payroll.basic_salary +
        payroll.house_allowance +
        payroll.transport_allowance +
        payroll.other_allowances +
        payroll.commission +
        payroll.bonus
    )
    payroll.gross_pay = gross

    ahl = gross * 0.015
    shif = 1700 if payroll.period < date(2024, 7, 1) else max(gross * 0.0275, 300)

    def calculate_nssf(gross):
        tier1 = min(gross, 8000) * 0.06
        tier2 = min(max(gross - 8000, 0), 64000) * 0.06
        return tier1 + tier2

    nssf = calculate_nssf(gross)
    payroll.nssf = nssf
    payroll.ahl = ahl
    payroll.shif = shif

    taxable = gross - ahl - shif - nssf

    def calculate_paye(taxable):
        if taxable <= 24000:
            tax = taxable * 0.1
        elif taxable <= 32333:
            tax = (24000 * 0.1) + ((taxable - 24000) * 0.25)
        else:
            tax = (24000 * 0.1) + (8333 * 0.25) + ((taxable - 32333) * 0.3)
        return max(tax - 2400, 0)

    paye = calculate_paye(taxable)
    payroll.paye = paye

    deductions = ahl + shif + nssf + paye + payroll.loan + payroll.advance
    payroll.net_pay = gross - deductions

    payroll.ahl_employer = ahl
    payroll.nssf_employer = nssf
    payroll.nita_employer = 50

    db.commit()
    db.refresh(payroll)
    employee = payroll.employee

    return PayrollDetailSchema(
        id=payroll.id,
        staff_no=employee.staff_no,
        name=employee.name,
        basic_salary=payroll.basic_salary,
        house_allowance=payroll.house_allowance,
        transport_allowance=payroll.transport_allowance,
        other_allowances=payroll.other_allowances,
        commission=payroll.commission,
        bonus=payroll.bonus,
        gross_pay=payroll.gross_pay,
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
        bank_name=employee.bank_name,
        bank_account=employee.bank_account,
        branch_name=employee.branch_name,
        branch_code=employee.branch_code,
        nssf_number=employee.nssf_number,
        nhif_number=employee.nhif_number,
        kra_pin=employee.kra_pin,
        email=employee.email,
        phone=employee.phone,
        id_number=employee.id_number,
    )

@router.delete("/{period}/details/{payroll_id}")
def delete_payroll_detail(period: date, payroll_id: int, db: Session = Depends(get_db)):
    payroll = db.query(PayrollModel).filter(PayrollModel.id == payroll_id, PayrollModel.period == period).first()
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll entry not found")
    db.delete(payroll)
    db.commit()
    return {"message": "Payroll entry deleted"}

@router.get("/payrolls/{period}/details", response_model=List[PayrollDetail])
def get_payroll_details(period: str, db: Session = Depends(get_db)):
    payrolls = (
        db.query(PayrollModel)
        .filter(PayrollModel.period == period)
        .all()
    )
    return payrolls

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
def batch_delete_payroll_details(period: date, payroll_ids: List[int] = Body(...), db: Session = Depends(get_db)):
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
        models.Employee.date_employed <= period,
        (models.Employee.date_left == None) | (models.Employee.date_left > period)
    ).all()
    return [
        {
            "id": e.id,
            "staff_no": e.staff_no,
            "name": e.name,
            "date_employed": e.date_employed,
            "date_left": e.date_left,
            # ...other fields...
        }
        for e in employees
    ]

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

