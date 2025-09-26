from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from sqlalchemy import extract
from datetime import date
import sqlite3

from database import get_db
import models
from models.loan_advance import LoanAdvance, EmployeeAdvance
from schemas.employee import CreateEmployee, UpdateEmployee, EmployeeSchema
from schemas.loan_advance import EmployeeAdvanceSchema, EmployeeLoanSchema

router = APIRouter(
    prefix="/employees",
    tags=["Employees"]
)

@router.post("/", response_model=EmployeeSchema)
def create_employee(
    employee: CreateEmployee,
    db: Session = Depends(get_db)
):
    prefix = "TNL" if employee.employment_type == "permanent" else "ITNL"
    last_employee = (
        db.query(models.Employee)
        .filter(models.Employee.staff_no.like(f"{prefix}%"))
        .order_by(models.Employee.id.desc())
        .first()
    )
    next_number = 1
    if last_employee and last_employee.staff_no:
        try:
            last_number = int(last_employee.staff_no.replace(prefix, ""))
            next_number = last_number + 1
        except:
            pass
    generated_staff_no = f"{prefix}{str(next_number).zfill(3)}"
    db_employee = models.Employee(**employee.dict(), staff_no=generated_staff_no)

    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return db_employee


@router.get("/", response_model=List[EmployeeSchema])
def get_employees(
    staff_no: Optional[str] = Query(None, description="Filter by staff_no"),
    surname: Optional[str] = Query(None, description="Filter by surname"),
    period: Optional[str] = Query(None, description="Exclude those already processed for this period"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Employee)

    if staff_no:
        query = query.filter(models.Employee.staff_no == staff_no)

    if surname:
        query = query.filter(models.Employee.name.ilike(f"%{surname}%"))

    if period:
        try:
            period_date = datetime.strptime(period, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid period format. Use YYYY-MM-DD.")

        year = period_date.year
        month = period_date.month

        posted_ids = (
            db.query(models.Payroll.employee_id)
            .filter(
                extract("year", models.Payroll.period) == year,
                extract("month", models.Payroll.period) == month,
            )
            .subquery()
        )

        employees = query.filter(models.Employee.id.not_in(posted_ids)).all()
    else:
        employees = query.all()

    return employees


@router.delete("/{staff_no}", response_model=dict)
def delete_employee(
    staff_no: str,
    db: Session = Depends(get_db)
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    db.delete(employee)
    db.commit()
    return {"detail": f"Employee {staff_no} deleted successfully"}


@router.get("/{staff_no}", response_model=EmployeeSchema)
def get_employee_details(staff_no: str, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    # Fetch loans and advances for this employee
    loans = db.query(LoanAdvance).filter(LoanAdvance.employee_id == employee.id).all()
    advances = db.query(EmployeeAdvance).filter(EmployeeAdvance.employee_id == employee.id).all()
    # Attach to employee schema
    result = EmployeeSchema.from_orm(employee)
    result.loans = loans or []
    result.advances = advances or []
    return result


@router.put("/employees/{staff_no}", response_model=EmployeeSchema)
async def update_employee(
    staff_no: str,
    name: str = Form(None),
    gender: str = Form(None),
    date_of_birth: str = Form(None),
    marital_status: str = Form(None),
    dependants: int = Form(None),
    id_number: str = Form(None),
    kra_pin: str = Form(None),
    nssf_number: str = Form(None),
    nhif_number: str = Form(None),
    passport_photo: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if name is not None:
        employee.name = name
    if gender is not None:
        employee.gender = gender
    if date_of_birth is not None:
        employee.date_of_birth = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
    if marital_status is not None:
        employee.marital_status = marital_status
    # For dependants in update_employee
    if dependants is not None:
        try:
            employee.dependants = int(dependants)
        except (TypeError, ValueError):
            employee.dependants = None
    if id_number is not None:
        employee.id_number = id_number
    if kra_pin is not None:
        employee.kra_pin = kra_pin
    if nssf_number is not None:
        employee.nssf_number = nssf_number
    if nhif_number is not None:
        employee.nhif_number = nhif_number
    if passport_photo is not None:
        employee.passport_photo = await passport_photo.read()

    db.commit()
    db.refresh(employee)
    return employee


@router.get("/employees/{staff_no}/photo")
def get_employee_photo(staff_no: str, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.staff_no == staff_no).first()
    if not employee or not employee.passport_photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=employee.passport_photo, media_type="image/jpeg")


def str_to_bool(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() == "true"
    return False

@router.put("/employees/{staff_no}/salary", response_model=EmployeeSchema)
async def update_salary_details(
    staff_no: str,
    employment_type: str = Form(None),
    payment_currency: str = Form(None),
    basic_salary: float = Form(None),
    work_shift: str = Form(None),
    off_days: str = Form(None),
    daily_hours: int = Form(8),
    income_tax: str = Form(None),
    deduct_shif: str = Form("false"),
    deduct_nssf: str = Form("false"),
    deduct_housing_levy: str = Form("false"),
    disability_exemption_amount: float = Form(None),
    exemption_certificate_no: str = Form(None),
    mobile_money: str = Form(None),
    bank_name: str = Form(None),
    bank_account: str = Form(None),
    branch_name: str = Form(None),
    branch_code: str = Form(None),
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.employment_type = employment_type
    employee.payment_currency = payment_currency
    # For numbers in update_salary_details
    if basic_salary is not None:
        try:
            employee.basic_salary = float(basic_salary)
        except (TypeError, ValueError):
            employee.basic_salary = None
    employee.work_shift = work_shift
    employee.off_days = off_days
    employee.daily_hours = daily_hours
    employee.income_tax = income_tax
    employee.deduct_shif = str_to_bool(deduct_shif)
    employee.deduct_nssf = str_to_bool(deduct_nssf)
    employee.deduct_housing_levy = str_to_bool(deduct_housing_levy)
    employee.disability_exemption_amount = disability_exemption_amount
    employee.exemption_certificate_no = exemption_certificate_no
    employee.mobile_money = mobile_money
    employee.bank_name = bank_name
    employee.bank_account = bank_account
    employee.branch_name = branch_name
    employee.branch_code = branch_code

    # Calculate daily and hourly rates
    working_days_per_month = 22
    if basic_salary and daily_hours:
        employee.daily_rate = round(basic_salary / working_days_per_month, 2)
        employee.hourly_rate = round(employee.daily_rate / daily_hours, 2)
    else:
        employee.daily_rate = None
        employee.hourly_rate = None

    db.commit()
    db.refresh(employee)
    return employee


@router.put("/{staff_no}/hr", response_model=EmployeeSchema)
def update_hr_details(
    staff_no: str,
    job_title: str = Form(None),
    department: str = Form(None),
    reports_to: str = Form(None),
    region: str = Form(None),
    is_director: str = Form(None),
    date_of_employment: str = Form(None),
    contract_start: str = Form(None),
    contract_end: str = Form(None),
    project: str = Form(None),
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.job_title = job_title
    employee.department = department
    employee.reports_to = reports_to
    employee.region = region
    employee.project = project
    employee.is_director = is_director == "true" or is_director == "True" or is_director == "1"
    if date_of_employment:
        employee.date_of_employment = datetime.strptime(date_of_employment, "%Y-%m-%d").date()
    if contract_start:
        employee.contract_start = datetime.strptime(contract_start, "%Y-%m-%d").date()
    if contract_end:
        employee.contract_end = datetime.strptime(contract_end, "%Y-%m-%d").date()

    db.commit()
    db.refresh(employee)
    return employee


@router.put("/{staff_no}/contact", response_model=EmployeeSchema)
def update_contact_details(
    staff_no: str,
    personal_email: str = Form(None),  # Renamed from email
    official_email: str = Form(None),
    phone: str = Form(None),
    office_phone: str = Form(None),
    country: str = Form(None),
    address: str = Form(None),
    city: str = Form(None),
    county: str = Form(None),
    postal_code: str = Form(None),
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.personal_email = personal_email
    employee.official_email = official_email
    employee.phone = phone
    employee.office_phone = office_phone
    employee.country = country
    employee.address = address
    employee.city = city
    employee.county = county
    employee.postal_code = postal_code

    db.commit()
    db.refresh(employee)
    return employee


