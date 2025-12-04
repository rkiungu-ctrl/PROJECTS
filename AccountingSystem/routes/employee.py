from fastapi import Body
import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
import logging
from typing import List, Optional
from datetime import datetime
from sqlalchemy import extract
from datetime import date
import traceback

from database import get_db
import models
from models.loan_advance import LoanAdvance, EmployeeAdvance
from schemas.employee import CreateEmployee, UpdateEmployee, EmployeeSchema

router = APIRouter(
    prefix="/employees",
    tags=["Employees"]
)

logger = logging.getLogger(__name__)

# Endpoint to update next_of_kin for an employee
@router.put("/{staff_no}/next_of_kin", response_model=EmployeeSchema)
def update_next_of_kin(
    staff_no: str,
    next_of_kin: str = Body(...),  # Expect JSON string from frontend
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    # Validate JSON
    try:
        json.loads(next_of_kin)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid next_of_kin JSON")
    employee.next_of_kin = next_of_kin
    db.commit()
    db.refresh(employee)
    # Return sanitized schema (avoid raw binary payloads)
    result = EmployeeSchema.from_orm(employee)
    try:
        result.passport_photo = None
        result.has_passport_photo = bool(employee.passport_photo)
        result.passport_photo_url = f"/employees/{staff_no}/photo"
    except Exception:
        pass
    return result


@router.put("/{staff_no}", response_model=EmployeeSchema)
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
    loans: str = Form(None),
    advances: str = Form(None),
    request: Request = None,
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    try:
        # Basic personal fields
        if name is not None:
            employee.name = name
        if gender is not None:
            employee.gender = gender
        if date_of_birth is not None:
            try:
                employee.date_of_birth = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
            except Exception:
                pass
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

        # Passport photo
        if passport_photo is not None:
            # store bytes
            employee.passport_photo = await passport_photo.read()
            try:
                logger.info("Received passport_photo for %s: filename=%s size=%d bytes", staff_no, getattr(passport_photo, 'filename', None), len(employee.passport_photo) if employee.passport_photo is not None else 0)
            except Exception:
                # non-fatal logging error
                pass
        else:
            logger.info("No passport_photo provided for %s", staff_no)

        # If loans/advances were sent as multipart file parts (requests.put files=...),
        # they may not be available as simple string Form fields. Try to re-read
        # from request.form() to handle both cases.
        if (not loans or loans is None) and request is not None:
            try:
                form = await request.form()
                if "loans" in form:
                    val = form.get("loans")
                    if hasattr(val, "read"):
                        try:
                            loans = (await val.read()).decode("utf-8")
                        except Exception:
                            try:
                                loans = val.file.read().decode("utf-8")
                            except Exception:
                                loans = None
                    else:
                        loans = str(val)
                if "advances" in form and (not advances or advances is None):
                    val = form.get("advances")
                    if hasattr(val, "read"):
                        try:
                            advances = (await val.read()).decode("utf-8")
                        except Exception:
                            try:
                                advances = val.file.read().decode("utf-8")
                            except Exception:
                                advances = None
                    else:
                        advances = str(val)
            except Exception:
                # ignore; we'll handle missing/invalid JSON later
                pass

        # debug: (disabled by default) -- remove or enable via EMPLOYEE_DEBUG env var
        # If you need trace logging for problematic payloads, set environment
        # variable EMPLOYEE_DEBUG=1 and re-enable writing below.

        # ----- Upsert loans (explicit deletions only) -----
        if loans:
            try:
                loans_list = json.loads(loans)
                if isinstance(loans_list, dict):
                    # sometimes frontend may send an object wrapper
                    loans_list = loans_list.get("loans") or []
            except Exception:
                loans_list = []

            try:
                for item in loans_list or []:
                    if not isinstance(item, dict):
                        continue
                    # explicit deletion: require id + deleted flag or action
                    if item.get("deleted") or item.get("action") == "delete":
                        lid = item.get("id")
                        try:
                            lid_int = int(lid)
                        except Exception:
                            lid_int = None
                        if lid_int:
                            existing = db.query(LoanAdvance).filter(LoanAdvance.id == lid_int, LoanAdvance.employee_id == employee.id).first()
                            if existing:
                                db.delete(existing)
                        continue

                    # update existing
                    lid = item.get("id")
                    lid_int = None
                    try:
                        lid_int = int(lid) if lid is not None else None
                    except Exception:
                        lid_int = None

                    if lid_int:
                        existing = db.query(LoanAdvance).filter(LoanAdvance.id == lid_int, LoanAdvance.employee_id == employee.id).first()
                        if existing:
                            # map known fields if present
                            for fld in ("loan_type", "reference_no", "principal_amount", "interest_rate", "repayment_period", "installment_amount", "deduction_method", "balance_outstanding", "amount_repaid", "status", "remarks"):
                                if fld in item:
                                    try:
                                        setattr(existing, fld, item.get(fld))
                                    except Exception:
                                        pass
                            # date fields
                            if item.get("date_issued"):
                                try:
                                    existing.date_issued = datetime.strptime(item.get("date_issued"), "%Y-%m-%d").date()
                                except Exception:
                                    pass
                            db.add(existing)
                            continue

                    # create new loan
                    try:
                        # ensure we always have a date_issued (model enforces NOT NULL)
                        date_issued_val = None
                        if item.get("date_issued"):
                            try:
                                date_issued_val = datetime.strptime(item.get("date_issued"), "%Y-%m-%d").date()
                            except Exception:
                                date_issued_val = None
                        if not date_issued_val:
                            date_issued_val = datetime.utcnow().date()

                        ref_no = item.get("reference_no") or item.get("reference") or f"LN-{employee.staff_no}-{int(datetime.utcnow().timestamp())}"

                        # avoid unique constraint errors: try to find an existing loan by reference_no
                        existing_by_ref = None
                        try:
                            existing_by_ref = db.query(LoanAdvance).filter(LoanAdvance.reference_no == ref_no, LoanAdvance.employee_id == employee.id).first()
                        except Exception:
                            existing_by_ref = None

                        if existing_by_ref:
                            # update existing loan found by reference
                            for fld in ("loan_type", "principal_amount", "interest_rate", "repayment_period", "installment_amount", "deduction_method", "balance_outstanding", "amount_repaid", "status", "remarks"):
                                if fld in item:
                                    try:
                                        setattr(existing_by_ref, fld, item.get(fld))
                                    except Exception:
                                        pass
                            existing_by_ref.date_issued = date_issued_val
                            db.add(existing_by_ref)
                        else:
                            new = LoanAdvance(
                                employee_id=employee.id,
                                loan_type=item.get("loan_type") or item.get("type") or "Staff Loan",
                                reference_no=ref_no,
                                principal_amount=item.get("principal_amount") or item.get("principal") or 0,
                                interest_rate=item.get("interest_rate") or 0.0,
                                repayment_period=item.get("repayment_period") or item.get("repayment") or 1,
                                installment_amount=item.get("installment_amount") or 0,
                                deduction_method=item.get("deduction_method") or item.get("deduction") or "fixed",
                                balance_outstanding=item.get("balance_outstanding") or item.get("balance") or 0,
                                amount_repaid=item.get("amount_repaid") or 0,
                                status=item.get("status") or "Active",
                                remarks=item.get("remarks"),
                                date_issued=date_issued_val,
                            )
                            db.add(new)
                    except Exception:
                        # continue processing other items; don't fail the whole update due to one bad loan
                        logger.exception("Failed to create/update loan for %s: %s", staff_no, item)
            except Exception:
                logger.exception("Unhandled error processing loans payload for %s", staff_no)

        # ----- Upsert advances (simple create/update/delete semantics) -----
        if advances:
            try:
                adv_list = json.loads(advances)
                if isinstance(adv_list, dict):
                    adv_list = adv_list.get("advances") or []
            except Exception:
                adv_list = []

            for item in adv_list or []:
                if not isinstance(item, dict):
                    continue
                if item.get("deleted") or item.get("action") == "delete":
                    aid = item.get("id")
                    try:
                        aid_int = int(aid) if aid is not None else None
                    except Exception:
                        aid_int = None
                    if aid_int:
                        existing = db.query(EmployeeAdvance).filter(EmployeeAdvance.id == aid_int, EmployeeAdvance.employee_id == employee.id).first()
                        if existing:
                            db.delete(existing)
                    continue

                aid = item.get("id")
                aid_int = None
                try:
                    aid_int = int(aid) if aid is not None else None
                except Exception:
                    aid_int = None
                if aid_int:
                    existing = db.query(EmployeeAdvance).filter(EmployeeAdvance.id == aid_int, EmployeeAdvance.employee_id == employee.id).first()
                    if existing:
                        for fld in ("amount", "balance", "recover_months", "note"):
                            if fld in item:
                                try:
                                    setattr(existing, fld, item.get(fld))
                                except Exception:
                                    pass
                        if item.get("issue_date"):
                            try:
                                existing.issue_date = datetime.strptime(item.get("issue_date"), "%Y-%m-%d").date()
                            except Exception:
                                pass
                        db.add(existing)
                        continue

                try:
                    new = EmployeeAdvance(
                        employee_id=employee.id,
                        amount=item.get("amount") or 0,
                        balance=item.get("balance") or 0,
                        recover_months=item.get("recover_months") or 1,
                        note=item.get("note"),
                    )
                    if item.get("issue_date"):
                        try:
                            new.issue_date = datetime.strptime(item.get("issue_date"), "%Y-%m-%d").date()
                        except Exception:
                            pass
                    db.add(new)
                except Exception:
                    logger.exception("Failed to create/update advance for %s: %s", staff_no, item)

        # commit all changes (employee fields + loans/advances)
        db.commit()
        db.refresh(employee)

        # Build response schema but do NOT include raw bytes for passport_photo
        result = EmployeeSchema.from_orm(employee)
        try:
            result.passport_photo = None
            result.has_passport_photo = bool(employee.passport_photo)
            result.passport_photo_url = f"/employees/{staff_no}/photo"
        except Exception:
            pass
        # attach loans/advances for a unified payload (frontend expects these)
        loans_objs = db.query(LoanAdvance).filter(LoanAdvance.employee_id == employee.id).all()
        adv_objs = db.query(EmployeeAdvance).filter(EmployeeAdvance.employee_id == employee.id).all()

        def serialize_loan(l):
            try:
                return {
                    "id": l.id,
                    "loan_type": l.loan_type,
                    "reference_no": l.reference_no,
                    "principal_amount": float(l.principal_amount) if l.principal_amount is not None else 0,
                    "date_issued": l.date_issued.isoformat() if getattr(l, 'date_issued', None) else None,
                    "interest_rate": l.interest_rate,
                    "repayment_period": l.repayment_period,
                    "installment_amount": float(l.installment_amount) if l.installment_amount is not None else 0,
                    "deduction_method": l.deduction_method,
                    "balance_outstanding": float(l.balance_outstanding) if l.balance_outstanding is not None else 0,
                    "amount_repaid": float(l.amount_repaid) if l.amount_repaid is not None else 0,
                    "status": l.status,
                    "remarks": l.remarks,
                }
            except Exception:
                return {}

        def serialize_advance(a):
            try:
                return {
                    "id": a.id,
                    "amount": float(a.amount) if a.amount is not None else 0,
                    "balance": float(a.balance) if a.balance is not None else 0,
                    "issue_date": a.issue_date.isoformat() if getattr(a, 'issue_date', None) else None,
                    "recover_months": a.recover_months,
                    "note": a.note,
                }
            except Exception:
                return {}

        result.loans = [serialize_loan(x) for x in loans_objs] if loans_objs else []
        result.advances = [serialize_advance(x) for x in adv_objs] if adv_objs else []
        return result
    except Exception as e:
        # log full exception and return a sanitized error to client
        logger.exception("Unhandled error in update_employee for %s", staff_no)
        # avoid writing debug files in normal operation; rely on logger/uvicorn logs
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{staff_no}/photo")
def get_employee_photo(staff_no: str, db: Session = Depends(get_db)):
    # use models.Employee consistently
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee or not employee.passport_photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=employee.passport_photo, media_type="image/jpeg")


def str_to_bool(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() == "true"
    return False


@router.put("/{staff_no}/salary", response_model=EmployeeSchema)
async def update_salary_details(
    staff_no: str,
    request: Request,
    db: Session = Depends(get_db),
):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    form = await request.form()

    # helper: set field only when present and non-empty (unless allow_blank)
    def set_if_present(field: str, cast=None, allow_blank=False):
        if field in form:
            value = form.get(field)
            if not allow_blank and (value is None or str(value).strip() == ""):
                return
            setattr(emp, field, cast(value) if cast else value)

    def to_float(x: str):
        try:
            return float(x)
        except Exception:
            return None

    def to_int(x: str):
        try:
            return int(x)
        except Exception:
            return None

    # Employment/salary fields
    set_if_present("employment_type")
    set_if_present("payment_currency")
    set_if_present("basic_salary", cast=to_float)
    set_if_present("work_shift")
    set_if_present("off_days")
    set_if_present("daily_hours", cast=to_int)
    set_if_present("income_tax")
    set_if_present("salary_processing_method")
    # booleans
    if "deduct_shif" in form:
        emp.deduct_shif = str_to_bool(form.get("deduct_shif"))
    if "deduct_nssf" in form:
        emp.deduct_nssf = str_to_bool(form.get("deduct_nssf"))
    if "deduct_housing_levy" in form:
        emp.deduct_housing_levy = str_to_bool(form.get("deduct_housing_levy"))

    # other fields
    set_if_present("disability_exemption_amount", cast=to_float)
    set_if_present("exemption_certificate_no")
    set_if_present("mobile_money")
    set_if_present("bank_name")
    set_if_present("bank_account")
    set_if_present("branch_name")
    set_if_present("branch_code")

    # Derived rates (only if we have salary & hours)
    if emp.basic_salary and emp.daily_hours:
        working_days_per_month = 22
        emp.daily_rate = round(float(emp.basic_salary) / working_days_per_month, 2)
        emp.hourly_rate = round(emp.daily_rate / int(emp.daily_hours), 2)

    db.commit()
    db.refresh(emp)

    # Return unified payload – serialize loans/advances into plain dicts to avoid Pydantic issues
    loans_objs = db.query(LoanAdvance).filter(LoanAdvance.employee_id == emp.id).all()
    adv_objs = db.query(EmployeeAdvance).filter(EmployeeAdvance.employee_id == emp.id).all()

    def serialize_loan(l):
        try:
            return {
                "id": l.id,
                "loan_type": l.loan_type,
                "reference_no": l.reference_no,
                "principal_amount": float(l.principal_amount) if l.principal_amount is not None else 0,
                "date_issued": l.date_issued.isoformat() if getattr(l, 'date_issued', None) else None,
                "interest_rate": l.interest_rate,
                "repayment_period": l.repayment_period,
                "installment_amount": float(l.installment_amount) if l.installment_amount is not None else 0,
                "deduction_method": l.deduction_method,
                "balance_outstanding": float(l.balance_outstanding) if l.balance_outstanding is not None else 0,
                "amount_repaid": float(l.amount_repaid) if l.amount_repaid is not None else 0,
                "status": l.status,
                "remarks": l.remarks,
            }
        except Exception:
            return {}

    def serialize_advance(a):
        try:
            return {
                "id": a.id,
                "amount": float(a.amount) if a.amount is not None else 0,
                "balance": float(a.balance) if a.balance is not None else 0,
                "issue_date": a.issue_date.isoformat() if getattr(a, 'issue_date', None) else None,
                "recover_months": a.recover_months,
                "note": a.note,
            }
        except Exception:
            return {}

    result = EmployeeSchema.from_orm(emp)
    try:
        result.passport_photo = None
    except Exception:
        pass
    result.loans = [serialize_loan(x) for x in loans_objs] if loans_objs else []
    result.advances = [serialize_advance(x) for x in adv_objs] if adv_objs else []
    return result



@router.put("/{staff_no}/hr", response_model=EmployeeSchema)
async def update_hr_details(
    staff_no: str,
    request: Request,
    db: Session = Depends(get_db),
):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    form = await request.form()

    def set_if_present(field: str, cast=None, allow_blank=False):
        if field in form:
            value = form.get(field)
            if not allow_blank and (value is None or str(value).strip() == ""):
                return  # skip blank overwrites
            setattr(emp, field, cast(value) if cast else value)

    # Map HR fields (only update when actually sent & non-empty)
    set_if_present("job_title")
    set_if_present("department")
    set_if_present("reports_to")
    set_if_present("head_of")           # ✅ persist Head of
    set_if_present("region")
    set_if_present("project")
    # is_director is boolean-ish
    if "is_director" in form:
        emp.is_director = str_to_bool(form.get("is_director"))

    # Dates
    def to_date(s: str):
        return datetime.strptime(s, "%Y-%m-%d").date()

    set_if_present("date_of_employment", cast=to_date)
    set_if_present("contract_start", cast=to_date)
    set_if_present("contract_end", cast=to_date)

    db.commit()
    db.refresh(emp)
    # Return unified payload
    loans = db.query(LoanAdvance).filter(LoanAdvance.employee_id == emp.id).all()
    advances = db.query(EmployeeAdvance).filter(EmployeeAdvance.employee_id == emp.id).all()
    result = EmployeeSchema.from_orm(emp)
    try:
        result.passport_photo = None
    except Exception:
        pass
    result.loans = loans or []
    result.advances = advances or []
    return result


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
    # Don't return raw bytes in the response
    result = EmployeeSchema.from_orm(employee)
    try:
        result.passport_photo = None
    except Exception:
        pass
    return result
