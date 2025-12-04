from fastapi import Body
import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
import logging
import os
from typing import List, Optional, Any, Dict
from datetime import datetime
from sqlalchemy import extract, text
from datetime import date
import traceback
import csv
from io import StringIO

from database import get_db
import models
from utils.loan_serializer import serialize_loan, serialize_advance
from routes.employee_loans import list_loans_for_employee
from models.employee_meta import EmployeeMeta
from models.loan_repayment import LoanRepayment
from schemas.employee import CreateEmployee, UpdateEmployee, EmployeeSchema

router = APIRouter(
    prefix="/employees",
    tags=["Employees"]
)

logger = logging.getLogger(__name__)
EMPLOYEE_DEBUG = os.getenv("EMPLOYEE_DEBUG", "0") not in ("0", "false", "False", "")


# NOTE: loan-attachment logic was removed by revert. Do not attach LoanAdvance
# objects directly to employee payloads in this file. Keep per-row repair and
# migration scripts elsewhere.



async def _parse_json_field(field_name: str, provided_value, request: Request = None):
    """Robustly parse a JSON payload coming either as a Form string or as a multipart file part.

    Returns a list (or dict) or [] on failure.
    """
    # If caller provided a value directly, prefer it
    val = provided_value
    if val is not None:
        # plain JSON string
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                if EMPLOYEE_DEBUG:
                    logger.debug("Failed to json.loads string for %s: %s", field_name, val)
                return []
        # UploadFile-like object
        if hasattr(val, "read"):
            try:
                raw = await val.read()
                try:
                    return json.loads(raw.decode("utf-8"))
                except Exception:
                    if EMPLOYEE_DEBUG:
                        logger.debug("Failed to json.loads bytes for %s", field_name)
                    return []
            except Exception:
                # some frameworks expose .file
                try:
                    raw = val.file.read()
                    return json.loads(raw.decode("utf-8"))
                except Exception:
                    return []
        # last resort: try to stringify
        try:
            return json.loads(str(val))
        except Exception:
            return []

    # If nothing provided, check request.form() (multipart forms)
    if request is not None:
        try:
            form = await request.form()
            if field_name in form:
                v = form.get(field_name)
                if v is None:
                    return []
                if hasattr(v, "read"):
                    try:
                        raw = await v.read()
                        return json.loads(raw.decode("utf-8"))
                    except Exception:
                        try:
                            return json.loads(v.file.read().decode("utf-8"))
                        except Exception:
                            return []
                else:
                    try:
                        return json.loads(str(v))
                    except Exception:
                        return []
        except Exception:
            if EMPLOYEE_DEBUG:
                logger.exception("Failed to read form for %s", field_name)
            return []

    return []


def _to_float(x, default=0.0):
    try:
        if x is None or x == "":
            return default
        return float(x)
    except Exception:
        return default


def _to_int(x, default=None):
    try:
        if x is None or x == "":
            return default
        return int(x)
    except Exception:
        return default


def _compute_installment(principal, annual_rate_percent, months):
    """Compute monthly installment using amortization formula.
    annual_rate_percent: e.g., 12 for 12% p.a. If zero or falsy, simple division is used.
    months: number of monthly installments
    """
    try:
        p = float(principal or 0)
        n = int(months or 0) or 0
        r = float(annual_rate_percent or 0) / 100.0 / 12.0
        if n <= 0:
            return 0.0
        if r == 0:
            return round(p / n, 2) if n else 0.0
        # monthly payment formula
        payment = p * (r * (1 + r) ** n) / ((1 + r) ** n - 1)
        return round(float(payment), 2)
    except Exception:
        return 0.0
 

# Endpoint to update next_of_kin for an employee
@router.put("/{staff_no}/next_of_kin", response_model=EmployeeSchema)
async def update_next_of_kin(
    staff_no: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Accept next_of_kin either as a JSON body, a form field, or a Python-list repr.

    This is defensive because tests and different clients sometimes send the
    payload as a raw string, form field, or JSON. We try JSON first, then
    fall back to ast.literal_eval for Python-style reprs.
    """
    import ast

    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    print("ENTER_UPDATE_EMP", staff_no)

    payload_str = None

    # If not provided as Body, try raw body first (clients sometimes send a plain
    # string without a form key), then fallback to request.form() when necessary.
    if not payload_str and request is not None:
        try:
            raw = await request.body()
            if raw:
                payload_str = raw.decode("utf-8")
            else:
                form = await request.form()
                if "next_of_kin" in form:
                    v = form.get("next_of_kin")
                    if v is not None:
                        # handle UploadFile-like objects
                        if hasattr(v, "read"):
                            raw2 = await v.read()
                            payload_str = raw2.decode("utf-8")
                        else:
                            payload_str = str(v)
        except Exception:
            # keep payload_str as-is
            if EMPLOYEE_DEBUG:
                logger.exception("Failed to read next_of_kin from request for %s", staff_no)

    if not payload_str:
        # Nothing to save
        raise HTTPException(status_code=400, detail="Missing next_of_kin payload")

    # Normalize: try JSON, then ast.literal_eval, else fail
    parsed = None
    try:
        parsed = json.loads(payload_str)
    except Exception:
        try:
            parsed = ast.literal_eval(payload_str)
        except Exception:
            parsed = None

    if parsed is None:
        raise HTTPException(status_code=400, detail="Invalid next_of_kin payload")

    # store as JSON string in DB (schemas will parse it back to list)
    try:
        employee.next_of_kin = json.dumps(parsed)
        db.commit()
        db.refresh(employee)
    except Exception as e:
        logger.exception("Failed to persist next_of_kin for %s", staff_no)
        raise HTTPException(status_code=500, detail=str(e))

    # Return sanitized schema (avoid raw binary payloads)
    schema = EmployeeSchema.from_orm(employee)
    base = schema.dict()
    try:
        base['passport_photo'] = None
        base['has_passport_photo'] = bool(employee.passport_photo)
        base['passport_photo_url'] = f"/employees/{staff_no}/photo"
    except Exception:
        pass
    return base

# ---- Increments endpoints (CRUD + auto-close previous period) -----
from datetime import timedelta


@router.get("/{staff_no}/increments")
def list_increments(staff_no: str, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    incs = db.query(models.Increment).filter(models.Increment.employee_id == emp.id).order_by(models.Increment.start_date.asc()).all()
    out = []
    for i, inc in enumerate(incs):
        # compute implied end_date if not present: next.start_date - 1 day
        end = inc.end_date
        if end is None:
            if i + 1 < len(incs):
                next_start = incs[i + 1].start_date
                try:
                    end = next_start - timedelta(days=1)
                except Exception:
                    end = None
        out.append({
            "id": inc.id,
            "start_date": inc.start_date.isoformat() if inc.start_date else None,
            "end_date": end.isoformat() if end else None,
            "gross_pay": float(inc.gross_pay) if inc.gross_pay is not None else 0,
        })
    return out


@router.post("/{staff_no}/increments")
def create_increment(staff_no: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    start = payload.get("start_date")
    gross = payload.get("gross_pay")
    end_date = payload.get("end_date")
    if not start or gross is None:
        raise HTTPException(status_code=400, detail="start_date and gross_pay are required")
    try:
        s = datetime.strptime(start, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_date format; expected YYYY-MM-DD")
    try:
        g = float(gross)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid gross_pay")

    e = None
    if end_date:
        try:
            e = datetime.strptime(end_date, "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid end_date format; expected YYYY-MM-DD")

    # Ensure we don't overlap with a next increment if provided
    next_inc = db.query(models.Increment).filter(models.Increment.employee_id == emp.id, models.Increment.start_date > s).order_by(models.Increment.start_date.asc()).first()
    if next_inc and e and e >= next_inc.start_date:
        raise HTTPException(status_code=400, detail="end_date overlaps with a later increment")

    # Create new increment
    new_inc = models.Increment(employee_id=emp.id, start_date=s, end_date=e, gross_pay=g)
    db.add(new_inc)
    db.commit()

    # Auto-close previous increment if it exists and has no end_date or overlaps
    prev = db.query(models.Increment).filter(models.Increment.employee_id == emp.id, models.Increment.start_date < s).order_by(models.Increment.start_date.desc()).first()
    if prev:
        should_update = False
        try:
            if prev.end_date is None or prev.end_date >= s:
                prev.end_date = s - timedelta(days=1)
                should_update = True
        except Exception:
            prev.end_date = s - timedelta(days=1)
            should_update = True
        if should_update:
            db.add(prev)
            db.commit()

    db.refresh(new_inc)
    return {"id": new_inc.id, "start_date": new_inc.start_date.isoformat(), "end_date": new_inc.end_date.isoformat() if new_inc.end_date else None, "gross_pay": float(new_inc.gross_pay)}


@router.put("/increments/{inc_id}")
def update_increment(inc_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    inc = db.query(models.Increment).filter(models.Increment.id == inc_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Increment not found")
    start = payload.get("start_date")
    gross = payload.get("gross_pay")
    end_date = payload.get("end_date")
    if start:
        try:
            s = datetime.strptime(start, "%Y-%m-%d").date()
            inc.start_date = s
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid start_date format; expected YYYY-MM-DD")
    if gross is not None:
        try:
            inc.gross_pay = float(gross)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid gross_pay")
    if end_date is not None:
        if end_date == "":
            inc.end_date = None
        else:
            try:
                inc.end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid end_date format; expected YYYY-MM-DD")

    # After update, ensure previous/next don't overlap
    # find prev and next by start_date relative to this increment
    prev = db.query(models.Increment).filter(models.Increment.employee_id == inc.employee_id, models.Increment.start_date < inc.start_date).order_by(models.Increment.start_date.desc()).first()
    nxt = db.query(models.Increment).filter(models.Increment.employee_id == inc.employee_id, models.Increment.start_date > inc.start_date).order_by(models.Increment.start_date.asc()).first()
    if prev:
        if prev.end_date is None or prev.end_date >= inc.start_date:
            prev.end_date = inc.start_date - timedelta(days=1)
            db.add(prev)
    if nxt and inc.end_date and inc.end_date >= nxt.start_date:
        raise HTTPException(status_code=400, detail="Updated end_date overlaps with next increment")

    db.add(inc)
    db.commit()
    db.refresh(inc)
    return {"id": inc.id, "start_date": inc.start_date.isoformat(), "end_date": inc.end_date.isoformat() if inc.end_date else None, "gross_pay": float(inc.gross_pay)}


@router.delete("/increments/{inc_id}")
def delete_increment(inc_id: int, db: Session = Depends(get_db)):
    inc = db.query(models.Increment).filter(models.Increment.id == inc_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Increment not found")
    emp_id = inc.employee_id
    # find next increment (by start_date)
    next_inc = db.query(models.Increment).filter(models.Increment.employee_id == emp_id, models.Increment.start_date > inc.start_date).order_by(models.Increment.start_date.asc()).first()
    prev = db.query(models.Increment).filter(models.Increment.employee_id == emp_id, models.Increment.start_date < inc.start_date).order_by(models.Increment.start_date.desc()).first()
    db.delete(inc)
    db.commit()
    # if prev exists, reopen its end_date to either next.start_date -1 or NULL
    if prev:
        if next_inc:
            prev.end_date = next_inc.start_date - timedelta(days=1)
        else:
            prev.end_date = None
        db.add(prev)
        db.commit()
    return {"message": "deleted"}


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

        # Parse loans/advances/benefits/earnings robustly from provided form fields or multipart parts.
        loans_list = await _parse_json_field("loans", loans, request)
        adv_list = await _parse_json_field("advances", advances, request)
        # Print to stdout so test runner captures it reliably
        print("DEBUG_PARSED_LOANS_LIST", staff_no, loans_list)
        logger.info("Parsed loans_list for %s: %r", staff_no, loans_list)
        benefits_list = await _parse_json_field("benefits", None, request)
        earnings_list = await _parse_json_field("earnings", None, request)

        # --- Accept a small set of salary scalar fields when using the full
        # employee update endpoint so clients that PUT the whole employee
        # (e.g. from the modal) can update these numeric allowances.
        try:
            form = await request.form()
            def set_if_present(field: str, cast=None, allow_blank=False):
                if field in form:
                    value = form.get(field)
                    if not allow_blank and (value is None or str(value).strip() == ""):
                        return
                    try:
                        setattr(employee, field, cast(value) if cast else value)
                    except Exception:
                        # best-effort: skip bad casts
                        pass

            def to_float(x: str):
                try:
                    return float(x)
                except Exception:
                    return None

            # common salary/scalar fields that are editable from the modal Benefits/Earnings sections
            set_if_present("house_allowance", cast=to_float)
            set_if_present("transport_allowance", cast=to_float)
            set_if_present("other_allowances", cast=to_float)
            set_if_present("commission", cast=to_float)
            set_if_present("bonus", cast=to_float)
            set_if_present("overtime", cast=to_float)
            # Also accept the broader salary fields so the modal's Salary tab
            # can save via the canonical PUT /employees/{staff_no} path.
            set_if_present("employment_type")
            set_if_present("payment_currency")
            set_if_present("basic_salary", cast=to_float)
            set_if_present("work_shift")
            set_if_present("off_days")
            set_if_present("daily_hours", cast=_to_int)
            set_if_present("income_tax")
            set_if_present("salary_processing_method")
            # bank/mobile fields
            set_if_present("mobile_money")
            set_if_present("bank_name")
            set_if_present("bank_account")
            set_if_present("branch_name")
            set_if_present("branch_code")
            set_if_present("exemption_certificate_no")
            set_if_present("disability_exemption_amount", cast=to_float)
            # booleans (deduction switches)
            if "deduct_shif" in form:
                employee.deduct_shif = str_to_bool(form.get("deduct_shif"))
            if "deduct_nssf" in form:
                employee.deduct_nssf = str_to_bool(form.get("deduct_nssf"))
            if "deduct_housing_levy" in form:
                employee.deduct_housing_levy = str_to_bool(form.get("deduct_housing_levy"))
            # Deduction flags are now fully controlled by HR - no automatic setting based on employment type
        except Exception:
            # non-fatal: if request.form() fails for any reason, proceed without these fields
            if EMPLOYEE_DEBUG:
                logger.exception("Failed to read salary scalar fields from form for %s", staff_no)

        # Recompute derived rates if basic_salary and daily_hours were changed
        try:
            if employee.basic_salary and employee.daily_hours:
                working_days_per_month = 22
                employee.daily_rate = round(float(employee.basic_salary) / working_days_per_month, 2)
                # protect division by zero
                dh = int(employee.daily_hours) if employee.daily_hours else 1
                employee.hourly_rate = round(employee.daily_rate / dh, 2)
        except Exception:
            pass

        # Persist benefits/earnings in the employee_meta table (key/value JSON)
        try:
            if isinstance(benefits_list, (list, dict)):
                val = json.dumps(benefits_list)
                meta = db.query(EmployeeMeta).filter(EmployeeMeta.employee_id == employee.id, EmployeeMeta.key == "benefits").first()
                if meta:
                    meta.value = val
                    db.add(meta)
                else:
                    db.add(EmployeeMeta(employee_id=employee.id, key="benefits", value=val))

            if isinstance(earnings_list, (list, dict)):
                val = json.dumps(earnings_list)
                meta = db.query(EmployeeMeta).filter(EmployeeMeta.employee_id == employee.id, EmployeeMeta.key == "earnings").first()
                if meta:
                    meta.value = val
                    db.add(meta)
                else:
                    db.add(EmployeeMeta(employee_id=employee.id, key="earnings", value=val))
            # Persist leaves if provided in the form as JSON
            try:
                leaves_list = await _parse_json_field("leaves", None, request)
                if isinstance(leaves_list, (list, dict)):
                    val = json.dumps(leaves_list)
                    meta = db.query(EmployeeMeta).filter(
                        EmployeeMeta.employee_id == employee.id,
                        EmployeeMeta.key == "leaves"
                    ).first()
                    if meta:
                        meta.value = val
                        db.add(meta)
                    else:
                        db.add(EmployeeMeta(employee_id=employee.id, key="leaves", value=val))
                    # ensure leaves meta is persisted immediately
                    db.commit()
            except Exception:
                # non-fatal but log for diagnostics
                logger.exception("Failed to persist leaves for %s", staff_no)

            # Optional: persist leave-related settings sent in the form so UI
            # can rely on stable metadata (monthly accrual rate, working pattern, etc.)
            try:
                form = await request.form()
                leave_meta_keys = [
                    "leaveMonthlyRate", "leaveWorkingPattern",
                    "leaveCustomWorkingDays", "leaveCutoffDate"
                ]
                any_meta = False
                for key in leave_meta_keys:
                    if key in form:
                        val = form.get(key)
                        db_meta = db.query(EmployeeMeta).filter(
                            EmployeeMeta.employee_id == employee.id,
                            EmployeeMeta.key == key
                        ).first()
                        if db_meta:
                            db_meta.value = str(val)
                            db.add(db_meta)
                        else:
                            db.add(EmployeeMeta(employee_id=employee.id, key=key, value=str(val)))
                        any_meta = True
                if any_meta:
                    db.commit()
            except Exception:
                # non-fatal; avoid breaking the main flow
                logger.exception("Failed to persist leave settings for %s", staff_no)
        except Exception:
            logger.exception("Failed to persist benefits/earnings for %s", staff_no)

        # debug: (disabled by default) -- remove or enable via EMPLOYEE_DEBUG env var
        # If you need trace logging for problematic payloads, set environment
        # variable EMPLOYEE_DEBUG=1 and re-enable writing below.

        # ----- Upsert loans (explicit deletions only) -----
        # Collect any loan rows we create/update during this request so we
        # can re-attach them to the response reliably (some DB/serialization
        # oddities previously resulted in an empty loans list in the PUT response).
        _updated_loans = []
        if loans_list:
            try:
                if isinstance(loans_list, dict):
                    # sometimes frontend may send an object wrapper
                    loans_list = loans_list.get("loans") or []
            except Exception:
                loans_list = []

            try:
                for item in loans_list or []:
                    print("LOOP_LOAN_ITEM", staff_no, item)
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
                            existing = db.query(models.LoanAdvance).filter(models.LoanAdvance.id == lid_int, models.LoanAdvance.employee_id == employee.id).first()
                            if existing:
                                # First delete dependent loan repayments to avoid foreign key constraint violation
                                try:
                                    db.query(models.LoanRepayment).filter(models.LoanRepayment.loan_id == lid_int).delete()
                                except Exception:
                                    # LoanRepayment model may not exist in all environments
                                    try:
                                        db.execute(text("DELETE FROM loan_repayments WHERE loan_id = :loan_id"), {"loan_id": lid_int})
                                    except Exception:
                                        pass
                                # Now delete the loan
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
                        existing = db.query(models.LoanAdvance).filter(models.LoanAdvance.id == lid_int, models.LoanAdvance.employee_id == employee.id).first()
                        if existing:
                            # map known fields if present (with safe casting for numeric fields)
                            for fld in ("loan_type", "reference_no", "principal_amount", "interest_rate", "repayment_period", "installment_amount", "deduction_method", "balance_outstanding", "amount_repaid", "status", "remarks"):
                                if fld in item:
                                    try:
                                        val = item.get(fld)
                                        if fld in ("principal_amount", "interest_rate", "installment_amount", "balance_outstanding", "amount_repaid"):
                                            setattr(existing, fld, _to_float(val))
                                        elif fld in ("repayment_period",):
                                            intval = _to_int(val, default=getattr(existing, fld, None) or 1)
                                            if intval is not None:
                                                setattr(existing, fld, intval)
                                        else:
                                            setattr(existing, fld, val)
                                    except Exception:
                                        pass
                            # date fields
                            if item.get("date_issued"):
                                try:
                                    existing.date_issued = datetime.strptime(item.get("date_issued"), "%Y-%m-%d").date()
                                except Exception:
                                    pass
                            # compute installment if principal/interest/period provided but installment missing
                            try:
                                p = _to_float(item.get("principal_amount") or item.get("principal") or getattr(existing, 'principal_amount', None), 0.0)
                                irr = _to_float(item.get("interest_rate"), getattr(existing, 'interest_rate', 0.0))
                                rpt = _to_int(item.get("repayment_period") or item.get("repayment"), getattr(existing, 'repayment_period', 1)) or 1
                                inst = _to_float(item.get("installment_amount"), getattr(existing, 'installment_amount', 0.0))
                                if (not inst or inst == 0) and p and rpt:
                                    computed = _compute_installment(p, irr, rpt)
                                    existing.installment_amount = computed
                                # ensure balance_outstanding defaults sensibly
                                if not getattr(existing, 'balance_outstanding', None):
                                    existing.balance_outstanding = p - (_to_float(getattr(existing, 'amount_repaid', 0.0)))
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
                            existing_by_ref = db.query(models.LoanAdvance).filter(models.LoanAdvance.reference_no == ref_no, models.LoanAdvance.employee_id == employee.id).first()
                        except Exception:
                            existing_by_ref = None

                        if existing_by_ref:
                            print("FOUND_EXISTING_BY_REF", staff_no, existing_by_ref.reference_no)
                            # update existing loan found by reference
                            for fld in ("loan_type", "principal_amount", "interest_rate", "repayment_period", "installment_amount", "deduction_method", "balance_outstanding", "amount_repaid", "status", "remarks"):
                                if fld in item:
                                    try:
                                        val = item.get(fld)
                                        if fld in ("principal_amount", "interest_rate", "installment_amount", "balance_outstanding", "amount_repaid"):
                                            setattr(existing_by_ref, fld, _to_float(val))
                                        elif fld in ("repayment_period",):
                                            intval = _to_int(val, default=getattr(existing_by_ref, fld, None) or 1)
                                            if intval is not None:
                                                setattr(existing_by_ref, fld, intval)
                                        else:
                                            setattr(existing_by_ref, fld, val)
                                    except Exception:
                                        pass
                            existing_by_ref.date_issued = date_issued_val
                            # compute installment when missing
                            try:
                                p = _to_float(item.get("principal_amount") or item.get("principal") or getattr(existing_by_ref, 'principal_amount', None), 0.0)
                                irr = _to_float(item.get("interest_rate"), getattr(existing_by_ref, 'interest_rate', 0.0))
                                rpt = _to_int(item.get("repayment_period") or item.get("repayment"), getattr(existing_by_ref, 'repayment_period', 1)) or 1
                                inst = _to_float(item.get("installment_amount"), getattr(existing_by_ref, 'installment_amount', 0.0))
                                if (not inst or inst == 0) and p and rpt:
                                    existing_by_ref.installment_amount = _compute_installment(p, irr, rpt)
                                if not getattr(existing_by_ref, 'balance_outstanding', None):
                                    existing_by_ref.balance_outstanding = p - (_to_float(getattr(existing_by_ref, 'amount_repaid', 0.0)))
                            except Exception:
                                pass
                            db.add(existing_by_ref)
                            try:
                                # ensure the DB assigns any defaults/ids and the object
                                # state is refreshed so serialization sees the up-to-date
                                # attributes (helps in tests where the response is
                                # immediately inspected)
                                db.flush()
                                try:
                                    db.refresh(existing_by_ref)
                                except Exception:
                                    # best-effort: continue even if refresh fails
                                    pass
                                _updated_loans.append(existing_by_ref)
                            except Exception:
                                pass
                        else:
                            print("CREATING_NEW_LOAN for", staff_no, ref_no)
                            new = models.LoanAdvance(
                                employee_id=employee.id,
                                loan_type=item.get("loan_type") or item.get("type") or "Staff Loan",
                                reference_no=ref_no,
                                principal_amount=_to_float(item.get("principal_amount") or item.get("principal"), 0.0),
                                interest_rate=_to_float(item.get("interest_rate"), 0.0),
                                repayment_period=_to_int(item.get("repayment_period") or item.get("repayment"), 1) or 1,
                                installment_amount=_to_float(item.get("installment_amount"), 0.0),
                                deduction_method=item.get("deduction_method") or item.get("deduction") or "fixed",
                                balance_outstanding=_to_float(item.get("balance_outstanding") or item.get("balance"), 0.0),
                                amount_repaid=_to_float(item.get("amount_repaid"), 0.0),
                                status=item.get("status") or "Active",
                                remarks=item.get("remarks"),
                                date_issued=date_issued_val,
                            )
                            # compute installment if not provided
                            try:
                                p = float(new.principal_amount or 0)
                                irr = float(new.interest_rate or 0)
                                rpt = int(new.repayment_period or 1)
                                if (not new.installment_amount or float(new.installment_amount) == 0) and p and rpt:
                                    new.installment_amount = _compute_installment(p, irr, rpt)
                                if not new.balance_outstanding or float(new.balance_outstanding) == 0:
                                    new.balance_outstanding = p - float(new.amount_repaid or 0.0)
                            except Exception:
                                pass
                            db.add(new)
                            try:
                                # force a DB flush and refresh so new.id and other
                                # computed attributes are available for response
                                db.flush()
                                try:
                                    db.refresh(new)
                                except Exception:
                                    pass
                                _updated_loans.append(new)
                            except Exception:
                                pass
                            logger.info("Created LoanAdvance ref=%s for employee %s", ref_no, staff_no)
                    except Exception:
                        # continue processing other items; don't fail the whole update due to one bad loan
                        logger.exception("Failed to create/update loan for %s: %s", staff_no, item)
            except Exception:
                logger.exception("Unhandled error processing loans payload for %s", staff_no)

        # ----- Upsert advances (simple create/update/delete semantics) -----
        if adv_list:
            try:
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
                        # advances are now stored in the canonical LoanAdvance table
                        existing = db.query(models.LoanAdvance).filter(models.LoanAdvance.id == aid_int, models.LoanAdvance.employee_id == employee.id).first()
                        if existing:
                            # First delete dependent loan repayments to avoid foreign key constraint violation
                            try:
                                db.query(LoanRepayment).filter(LoanRepayment.loan_id == aid_int).delete()
                            except Exception:
                                # LoanRepayment model may not exist in all environments
                                try:
                                    db.execute(text("DELETE FROM loan_repayments WHERE loan_id = :loan_id"), {"loan_id": aid_int})
                                except Exception:
                                    pass
                            # Now delete the advance
                            db.delete(existing)
                    continue

                aid = item.get("id")
                aid_int = None
                try:
                    aid_int = int(aid) if aid is not None else None
                except Exception:
                    aid_int = None
                    if aid_int:
                        existing = db.query(models.LoanAdvance).filter(models.LoanAdvance.id == aid_int, models.LoanAdvance.employee_id == employee.id).first()
                        if existing:
                            # map advance-like fields into canonical LoanAdvance fields
                            if "amount" in item:
                                try:
                                    existing.principal_amount = _to_float(item.get("amount"))
                                except Exception:
                                    pass
                            if "balance" in item:
                                try:
                                    existing.balance_outstanding = _to_float(item.get("balance"))
                                except Exception:
                                    pass
                            if "recover_months" in item:
                                try:
                                    existing.repayment_period = _to_int(item.get("recover_months"), 1) or 1
                                except Exception:
                                    pass
                            if "note" in item:
                                existing.remarks = item.get("note")
                            if item.get("issue_date"):
                                try:
                                    existing.date_issued = datetime.strptime(item.get("issue_date"), "%Y-%m-%d").date()
                                except Exception:
                                    pass
                            db.add(existing)
                            continue

                try:
                    # Represent advances using the canonical LoanAdvance model
                    issue_dt = None
                    if item.get("issue_date"):
                        try:
                            issue_dt = datetime.strptime(item.get("issue_date"), "%Y-%m-%d").date()
                        except Exception:
                            issue_dt = datetime.utcnow().date()
                    else:
                        issue_dt = datetime.utcnow().date()

                    principal = _to_float(item.get("amount"), 0.0)
                    repay_months = _to_int(item.get("recover_months"), 1) or 1
                    balance_val = _to_float(item.get("balance"), principal)
                    installment = round(float(balance_val) / float(repay_months), 2) if repay_months else balance_val

                    new = models.LoanAdvance(
                        employee_id=employee.id,
                        loan_type=item.get("loan_type") or item.get("type") or "Salary Advance",
                        reference_no=item.get("reference_no") or f"ADV-{employee.staff_no}-{int(datetime.utcnow().timestamp())}",
                        principal_amount=principal,
                        interest_rate=_to_float(item.get("interest_rate"), 0.0),
                        repayment_period=repay_months,
                        installment_amount=installment,
                        deduction_method=item.get("deduction_method") or "fixed",
                        balance_outstanding=balance_val,
                        amount_repaid=_to_float(item.get("amount_repaid"), 0.0),
                        status=item.get("status") or "Active",
                        remarks=item.get("note") or item.get("remarks"),
                        date_issued=issue_dt,
                    )
                    db.add(new)
                except Exception:
                    logger.exception("Failed to create/update advance for %s: %s", staff_no, item)

        # commit all changes (employee fields + loans/advances)
        print("ABOUT_TO_COMMIT", staff_no, "_updated_loans_count=", len(_updated_loans))
        db.commit()
        print("AFTER_COMMIT", staff_no)
        db.refresh(employee)

        # Build response schema but do NOT include raw bytes for passport_photo
        schema = EmployeeSchema.from_orm(employee)
        base = schema.dict()
        try:
            base['passport_photo'] = None
            base['has_passport_photo'] = bool(employee.passport_photo)
            base['passport_photo_url'] = f"/employees/{staff_no}/photo"
        except Exception:
            pass
        # Re-attach serialized loans/advances (safe primitives only) so clients
        # that expect loans in the PUT response continue to work. Use the
        # central serializers to avoid returning raw ORM objects.
        print("BEFORE_REATTACH", staff_no)
        try:
            print("IN_REATTACH_TRY", staff_no)
            Loan = getattr(models, 'LoanAdvance', None)
            print("REATTACH_LOAN_CLASS_PRESENT", staff_no, Loan is not None)
            if Loan is not None:
                try:
                    rows = db.query(Loan).filter(Loan.employee_id == employee.id).all()
                    print("REATTACH_ROWS_COUNT", staff_no, len(rows))
                except Exception as _qex:
                    # fallback to raw SQL like the GET handler when ORM column
                    # processors choke on malformed values (e.g. empty date strings)
                    print("REATTACH_ORM_FAILED_FALLBACK", staff_no, str(_qex))
                    from types import SimpleNamespace
                    try:
                        raw_rows = db.execute(text("SELECT * FROM loan_advances WHERE employee_id = :eid"), {"eid": employee.id}).mappings().all()
                        rows = []
                        for r in raw_rows:
                            rd = dict(r)
                            if rd.get('date_issued') == '':
                                rd['date_issued'] = None
                            sch = rd.get('schedule')
                            if isinstance(sch, str) and sch:
                                try:
                                    import json as _json
                                    rd['schedule'] = _json.loads(sch)
                                except Exception:
                                    rd['schedule'] = []
                            rows.append(SimpleNamespace(**rd))
                        print("REATTACH_FALLBACK_ROWS", staff_no, len(rows))
                    except Exception as _rfex:
                        print("REATTACH_FALLBACK_FAILED", staff_no, str(_rfex))
                        rows = []
                # Merge persisted rows with the in-memory list of updated/created
                # objects to ensure the response contains the most-recent items.
                # Merge persisted rows with the in-memory list of updated/created
                # objects. If an updated object matches a persisted row by id,
                # replace the persisted row with the in-memory object so the
                # most-recent attributes (which may not round-trip via raw SQL)
                # are used for serialization.
                merged = list(rows)
                for r in _updated_loans:
                    rid = getattr(r, 'id', None)
                    if rid is None:
                        merged.append(r)
                        continue
                    replaced = False
                    for i, existing_row in enumerate(merged):
                        if getattr(existing_row, 'id', None) == rid:
                            merged[i] = r
                            replaced = True
                            break
                    if not replaced:
                        merged.append(r)

                loans_serialized = []
                for r in merged:
                    try:
                        loans_serialized.append(serialize_loan(r))
                    except Exception as ex:
                        print("SERIALIZE_LOAN_ERROR", getattr(r, 'id', None), ex)
                base['loans'] = loans_serialized

                advances_serialized = []
                for r in merged:
                    try:
                        if 'advance' in ((getattr(r, 'loan_type', '') or '').lower()):
                            advances_serialized.append(serialize_advance(r))
                    except Exception as ex:
                        print("SERIALIZE_ADV_ERROR", getattr(r, 'id', None), ex)
                base['advances'] = advances_serialized
            else:
                base['loans'] = []
                base['advances'] = []
        except Exception:
            base['loans'] = []
            base['advances'] = []
        return base
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


@router.get("/{staff_no}")
def get_employee(staff_no: str, db: Session = Depends(get_db)):
    """Safe serializer for a single employee that returns plain primitives and a lightweight loan summary.

    This avoids returning raw ORM relationships or bytes which can trigger 500s during
    response serialization in some environments.
    """
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    import json

    def _row_to_dict(row) -> Dict[str, Any]:
        return {c.name: getattr(row, c.name) for c in row.__table__.columns}

    def _parse_jsonish(value):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except Exception:
            return value

    base = _row_to_dict(emp)

    # Clean up known binary/blob fields if present
    for blob_field in ("passport_photo", "signature", "profile_image"):
        if blob_field in base:
            base[blob_field] = None

    # Parse JSON-like text fields
    for js_field in ("next_of_kin", "leaves", "other_contacts", "documents"):
        if js_field in base:
            base[js_field] = _parse_jsonish(base[js_field])

    # NOTE: loan/advance attachment removed per revert request.
    # Provide a lightweight loan/advance summary (primitives only) for UI prefill
    try:
        # Ensure leaves stored in EmployeeMeta are surfaced to the UI
        try:
            lm = db.query(EmployeeMeta).filter(EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "leaves").first()
            base['leaves'] = json.loads(lm.value) if lm and lm.value else []
        except Exception:
            base['leaves'] = []

        # Defensive: model/table may not exist in some DBs
        Loan = getattr(models, 'LoanAdvance', None)
        if Loan is not None:
            # Fetch all loans/advances for this employee in a single go and compute
            # aggregates in Python. This avoids SQL expression surprises and is
            # easier to debug when serialization fails.
            try:
                # Try the ORM path first. This is the normal fast path.
                print("GET_EMP_LOANS_ORM_QUERY", emp.staff_no)
                loans_all = db.query(Loan).filter(Loan.employee_id == emp.id).all()
                print("GET_EMP_LOANS_ORM_OK", emp.staff_no, len(loans_all))
            except Exception as _orm_exc:
                # fallback: query raw rows and build lightweight proxies to avoid
                # SQLAlchemy column processors choking on malformed values (e.g. '' in date columns)
                print("GET_EMP_LOANS_ORM_FAILED_FALLBACK", emp.staff_no, str(_orm_exc))
                try:
                    from types import SimpleNamespace
                    rows = db.execute(text("SELECT * FROM loan_advances WHERE employee_id = :eid"), {"eid": emp.id}).mappings().all()
                    loans_all = []
                    for r in rows:
                        # normalize problematic date fields and schedule
                        rd = dict(r)
                        if rd.get('date_issued') == '':
                            rd['date_issued'] = None
                        # try to parse schedule if it's a string
                        sch = rd.get('schedule')
                        if isinstance(sch, str) and sch:
                            try:
                                import json as _json
                                rd['schedule'] = _json.loads(sch)
                            except Exception:
                                rd['schedule'] = []
                        loans_all.append(SimpleNamespace(**rd))
                    print("GET_EMP_LOANS_FALLBACK_ROWS", emp.staff_no, len(loans_all))
                except Exception as _fb_exc:
                    print("GET_EMP_LOANS_FALLBACK_FAILED", emp.staff_no, str(_fb_exc))
                    loans_all = []

            # Use the authoritative loans endpoint calculation instead of duplicate logic
            try:
                authoritative_loans = list_loans_for_employee(emp.staff_no, db)
                
                loan_sum = advance_sum = loan_due = advance_due = 0.0
                loans_list = []
                advances_list = []
                
                for loan in authoritative_loans:
                    lt = (loan.get('loan_type', '') or '').lower()
                    status = (loan.get('status', '') or '').lower()
                    bal = float(loan.get('balance_outstanding', 0) or 0)
                    inst = float(loan.get('installment_amount', 0) or 0)
                    
                    loans_list.append(loan)
                    if 'advance' in lt:
                        advances_list.append(loan)
                        if status == 'active' and bal > 0:
                            advance_sum += bal
                            if advance_due == 0 and inst > 0:
                                advance_due = inst
                    else:
                        if status == 'active' and bal > 0:
                            loan_sum += bal
                            if loan_due == 0 and inst > 0:
                                loan_due = inst
                
                base['loan'] = round(loan_sum, 2)
                base['advance'] = round(advance_sum, 2)
                base['loan_due'] = round(loan_due, 2)
                base['advance_due'] = round(advance_due, 2)
                base['loans'] = loans_list
                base['advances'] = advances_list
            except Exception as e:
                # Fallback to safe defaults if loans endpoint fails
                logger.exception("Failed to get authoritative loan data for %s: %s", emp.staff_no, e)
                base['loan'] = 0.0
                base['advance'] = 0.0
                base['loan_due'] = 0.0
                base['advance_due'] = 0.0
                base['loans'] = []
                base['advances'] = []
        else:
            base['loan'] = 0.0
            base['advance'] = 0.0
            base['loan_due'] = 0.0
            base['advance_due'] = 0.0
            base['loans'] = []
            base['advances'] = []
    except Exception:
        # keep response stable even if loan table/schema isn't present
        base['loan'] = 0.0
        base['advance'] = 0.0
        base['loan_due'] = 0.0
        base['advance_due'] = 0.0
        base['loans'] = []
        base['advances'] = []

    return base


@router.get("/")
def list_employees(db: Session = Depends(get_db)):
    """Return a list of all employees (sanitized) including loans/advances.
    Uses a safe serializer so nulls/mismatched types never nuke the whole row.
    """
    import json
    emps = db.query(models.Employee).all()

    def _row_to_dict(row):
        return {c.name: getattr(row, c.name) for c in row.__table__.columns}

    def _parse_jsonish(value):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except Exception:
            return value

    out = []
    for emp in emps:
        try:
            # Try the strict schema first
            try:
                schema = EmployeeSchema.from_orm(emp)
                base = schema.dict()
            except Exception:
                # Fallback: safe dict of DB columns
                base = _row_to_dict(emp)

            # Sanitize blobs & add photo url
            for blob_field in ("passport_photo", "signature", "profile_image"):
                if blob_field in base:
                    base[blob_field] = None
            try:
                base["has_passport_photo"] = bool(getattr(emp, "passport_photo", None))
                base["passport_photo_url"] = f"/employees/{emp.staff_no}/photo"
            except Exception:
                pass

            # Parse JSON-like text fields you store as JSON strings
            for js_field in ("next_of_kin", "leaves", "other_contacts", "documents"):
                if js_field in base:
                    base[js_field] = _parse_jsonish(base[js_field])

            # Pull meta (benefits/earnings/leaves)
            try:
                bm = db.query(EmployeeMeta).filter(
                    EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "benefits"
                ).first()
                base["benefits"] = json.loads(bm.value) if bm and bm.value else []
            except Exception:
                base["benefits"] = []
            try:
                em = db.query(EmployeeMeta).filter(
                    EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "earnings"
                ).first()
                base["earnings"] = json.loads(em.value) if em and em.value else []
            except Exception:
                base["earnings"] = []
            try:
                lm = db.query(EmployeeMeta).filter(
                    EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "leaves"
                ).first()
                base["leaves"] = json.loads(lm.value) if lm and lm.value else base.get("leaves") or []
            except Exception:
                base["leaves"] = base.get("leaves") or []

            # --- Use authoritative loans calculation ---
            try:
                authoritative_loans = list_loans_for_employee(emp.staff_no, db)
                
                loan_sum = advance_sum = loan_due = advance_due = 0.0
                loans_list = []
                advances_list = []
                
                for loan in authoritative_loans:
                    lt = (loan.get('loan_type', '') or '').lower()
                    status = (loan.get('status', '') or '').lower()
                    bal = float(loan.get('balance_outstanding', 0) or 0)
                    inst = float(loan.get('installment_amount', 0) or 0)
                    
                    loans_list.append(loan)
                    if 'advance' in lt:
                        advances_list.append(loan)
                        if status == 'active' and bal > 0:
                            advance_sum += bal
                            if advance_due == 0 and inst > 0:
                                advance_due = inst
                    else:
                        if status == 'active' and bal > 0:
                            loan_sum += bal
                            if loan_due == 0 and inst > 0:
                                loan_due = inst
                
                base["loan"] = round(loan_sum, 2)
                base["advance"] = round(advance_sum, 2)
                base["loan_due"] = round(loan_due, 2)
                base["advance_due"] = round(advance_due, 2)
                base["loans"] = loans_list
                base["advances"] = advances_list
            except Exception:
                base.update(
                    {"loan": 0.0, "advance": 0.0, "loan_due": 0.0, "advance_due": 0.0, "loans": [], "advances": []}
                )

            out.append(base)
        except Exception:
            # Skip only the broken row; never fail the whole list
            logger.exception("Failed to serialize employee %s", getattr(emp, "staff_no", None))
            continue

    return out



def str_to_bool(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() == "true"
    return False


@router.post("/import")
async def import_employees(
    file: UploadFile = File(...),
    apply: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Import employees from a CSV file.

    - By default this runs as a dry-run (apply=false) and returns a summary of
      what *would* be created/updated. Set apply=true to persist the changes.
    - CSV header names should match model field names (e.g. staff_no, name,
      id_number, kra_pin, nssf_number, nhif_number, bank_name, bank_account,
      mobile_money, employment_type, basic_salary, job_title, department,
      date_of_employment). Unknown columns are ignored.
    """
    content = await file.read()
    try:
        txt = content.decode("utf-8-sig")
    except Exception:
        try:
            txt = content.decode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail="Unable to decode uploaded CSV file")

    reader = csv.DictReader(StringIO(txt))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file has no headers")

    # allowed updatable/creatable fields on Employee
    allowed = {
        "staff_no", "name", "personal_email", "official_email", "phone", "office_phone",
        "country", "address", "city", "county", "postal_code",
        "kra_pin", "id_number", "nssf_number", "nhif_number",
        "bank_name", "bank_account", "branch_name", "branch_code", "account_name",
        "basic_salary", "house_allowance", "transport_allowance", "other_allowances",
        "commission", "bonus", "overtime", "employment_type", "payment_currency",
        "work_shift", "off_days", "daily_hours", "income_tax", "mobile_money",
        "job_title", "department", "reports_to", "head_of", "region", "project",
        "date_of_employment",
    }

    plan = []
    errors = []
    created = 0
    updated = 0

    rows = list(reader)
    for i, raw in enumerate(rows, start=1):
        # normalize column keys to lowercase snake_case-ish
        norm = {k.strip().lower().replace(" ", "_"): (v.strip() if isinstance(v, str) else v) for k, v in raw.items()}
        staff_no = norm.get("staff_no") or norm.get("staffno") or norm.get("staff")
        id_number = norm.get("id_number") or norm.get("id")

        if not staff_no and not id_number:
            errors.append({"row": i, "error": "Missing staff_no or id_number"})
            continue

        # try to find existing employee
        emp = None
        if staff_no:
            emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
        if emp is None and id_number:
            emp = db.query(models.Employee).filter(models.Employee.id_number == id_number).first()

        # Build field updates
        updates = {}
        for k, v in norm.items():
            if k in allowed and v != "":
                updates[k] = v

        # conservative type casting/validation for a few fields
        if "basic_salary" in updates:
            try:
                updates["basic_salary"] = float(updates["basic_salary"]) if updates["basic_salary"] is not None else None
            except Exception:
                errors.append({"row": i, "error": "Invalid basic_salary"})
                continue
        if "daily_hours" in updates:
            try:
                updates["daily_hours"] = int(float(updates["daily_hours"]))
            except Exception:
                updates["daily_hours"] = None
        if "date_of_employment" in updates:
            try:
                updates["date_of_employment"] = datetime.strptime(updates["date_of_employment"], "%Y-%m-%d").date()
            except Exception:
                errors.append({"row": i, "error": "Invalid date_of_employment, expected YYYY-MM-DD"})
                continue

        plan.append({"row": i, "staff_no": staff_no, "id_number": id_number, "existing": bool(emp), "updates": updates})

    # If not applying, return summary of plan
    if not apply:
        # summarize counts
        for p in plan:
            if p["existing"]:
                updated += 1
            else:
                created += 1
        return {"dry_run": True, "to_create": created, "to_update": updated, "rows": plan, "errors": errors}

    # apply changes
    try:
        for p in plan:
            staff_no = p["staff_no"]
            id_number = p["id_number"]
            updates = p["updates"]
            emp = None
            if staff_no:
                emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
            if emp is None and id_number:
                emp = db.query(models.Employee).filter(models.Employee.id_number == id_number).first()

            if emp:
                # update fields
                for k, v in updates.items():
                    try:
                        setattr(emp, k, v)
                    except Exception:
                        # skip bad assignments
                        pass
                db.add(emp)
                updated += 1
            else:
                # create new employee; require staff_no & name
                if not staff_no or not p["updates"].get("name"):
                    errors.append({"row": p["row"], "error": "Creating new employee requires staff_no and name"})
                    continue
                new = models.Employee(
                    staff_no=staff_no,
                    name=p["updates"].get("name") or "",
                )
                for k, v in updates.items():
                    if k in ("staff_no", "name"):
                        continue
                    try:
                        setattr(new, k, v)
                    except Exception:
                        pass
                # Apply deduction defaults based on employment_type for newly created employees
                # Apply explicit deduction flag updates only if provided
                if 'deduct_shif' in updates:
                    new.deduct_shif = bool(updates.get('deduct_shif'))
                if 'deduct_nssf' in updates:
                    new.deduct_nssf = bool(updates.get('deduct_nssf'))
                if 'deduct_housing_levy' in updates:
                    new.deduct_housing_levy = bool(updates.get('deduct_housing_levy'))
                db.add(new)
                created += 1

        db.commit()
    except Exception:
        logger.exception("Failed applying employee import")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to apply import; rolled back")

    return {"dry_run": False, "created": created, "updated": updated, "errors": errors}


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
    # bank/account and extra salary components
    set_if_present("account_name")
    set_if_present("house_allowance", cast=to_float)
    set_if_present("transport_allowance", cast=to_float)
    set_if_present("other_allowances", cast=to_float)
    set_if_present("commission", cast=to_float)
    set_if_present("bonus", cast=to_float)
    set_if_present("overtime", cast=to_float)
    set_if_present("cash_notes")
    set_if_present("cheque_number")
    set_if_present("cheque_bank_name")
    # booleans
    if "deduct_shif" in form:
        emp.deduct_shif = str_to_bool(form.get("deduct_shif"))
    if "deduct_nssf" in form:
        emp.deduct_nssf = str_to_bool(form.get("deduct_nssf"))
    if "deduct_housing_levy" in form:
        emp.deduct_housing_levy = str_to_bool(form.get("deduct_housing_levy"))

    # Deduction flags are now fully controlled by HR - no automatic defaults based on employment type

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

    # Parse and persist benefits/earnings if provided on the salary endpoint
    try:
        benefits_list = await _parse_json_field("benefits", None, request)
        earnings_list = await _parse_json_field("earnings", None, request)
        if isinstance(benefits_list, (list, dict)):
            val = json.dumps(benefits_list)
            meta = db.query(EmployeeMeta).filter(EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "benefits").first()
            if meta:
                meta.value = val
                db.add(meta)
            else:
                db.add(EmployeeMeta(employee_id=emp.id, key="benefits", value=val))

        if isinstance(earnings_list, (list, dict)):
            val = json.dumps(earnings_list)
            meta = db.query(EmployeeMeta).filter(EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "earnings").first()
            if meta:
                meta.value = val
                db.add(meta)
            else:
                db.add(EmployeeMeta(employee_id=emp.id, key="earnings", value=val))
    except Exception:
        logger.exception("Failed to persist benefits/earnings from /salary for %s", staff_no)

    db.commit()
    db.refresh(emp)

    schema = EmployeeSchema.from_orm(emp)
    base = schema.dict()
    try:
        base['passport_photo'] = None
    except Exception:
        pass
    try:
        bm = db.query(EmployeeMeta).filter(EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "benefits").first()
        base['benefits'] = json.loads(bm.value) if bm and bm.value else []
    except Exception:
        base['benefits'] = []
    try:
        em = db.query(EmployeeMeta).filter(EmployeeMeta.employee_id == emp.id, EmployeeMeta.key == "earnings").first()
        base['earnings'] = json.loads(em.value) if em and em.value else []
    except Exception:
        base['earnings'] = []
    return base



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
    schema = EmployeeSchema.from_orm(emp)
    base = schema.dict()
    try:
        base['passport_photo'] = None
    except Exception:
        pass
    return base


@router.post("/{staff_no}/terminate", response_model=EmployeeSchema)
def terminate_employee(
    staff_no: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Record an employee termination and basic audit info.

    Accepts JSON payload with optional keys:
      - termination_date: "YYYY-MM-DD"
      - termination_reason: string
      - pro_rate_basic: bool
      - accumulated_leave_payout: number
      - terminated_by: string (user identifier)

    This endpoint sets employee.status = 'Terminated', stores termination fields
    and records terminated_by and terminated_at.
    """
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # termination_date (optional)
    term_date = payload.get("termination_date")
    if term_date:
        try:
            emp.termination_date = datetime.strptime(term_date, "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid termination_date; expected YYYY-MM-DD")

    # reason
    emp.termination_reason = payload.get("termination_reason") or payload.get("reason")

    # pro-rate flag
    try:
        emp.pro_rate_basic = bool(payload.get("pro_rate_basic")) if "pro_rate_basic" in payload else None
    except Exception:
        emp.pro_rate_basic = None

    # accumulated leave payout
    try:
        if "accumulated_leave_payout" in payload:
            emp.accumulated_leave_payout = float(payload.get("accumulated_leave_payout") or 0.0)
    except Exception:
        emp.accumulated_leave_payout = None

    # audit
    emp.status = "Terminated"
    emp.terminated_by = payload.get("terminated_by") or payload.get("by")
    emp.terminated_at = datetime.utcnow()

    db.add(emp)
    db.commit()
    db.refresh(emp)

    # Return unified payload (sanitize photo bytes)
    schema = EmployeeSchema.from_orm(emp)
    base = schema.dict()
    try:
        base['passport_photo'] = None
        base['has_passport_photo'] = bool(emp.passport_photo)
        base['passport_photo_url'] = f"/employees/{staff_no}/photo"
    except Exception:
        pass
    # NOTE: loans/advances have been removed from this payload by revert
    return base


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
    schema = EmployeeSchema.from_orm(employee)
    base = schema.dict()
    try:
        base['passport_photo'] = None
    except Exception:
        pass
    return base
