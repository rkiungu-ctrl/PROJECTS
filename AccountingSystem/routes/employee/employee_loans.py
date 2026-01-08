# routes/employee_loans.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import date
from sqlalchemy import select, update
from typing import List, Optional
from pydantic import BaseModel
from datetime import date as _date, datetime

from database import get_db
import models
from models.loan_advance import LoanAdvance  # adjust to your actual path
from models.loan_repayment import LoanRepayment
from sqlalchemy import func, and_
from datetime import datetime as _dt
from models.journal import JournalEntry, JournalLine
from models.account import Account

router = APIRouter(prefix="/employees", tags=["Employees - Loans/Advances"])

# ----------------------------- DTOs ---------------------------------

class RepaymentItem(BaseModel):
    reference_no: str
    period_ym: Optional[str] = None
    installment: float

class RepaymentBatch(BaseModel):
    staff_no: Optional[str] = None
    repayments: List[RepaymentItem]

class LoanCreate(BaseModel):
    type: str = "Advance"                 # "Advance" | "Loan"
    reference_no: str
    date_issued: _date
    principal: float
    interest_rate: Optional[float] = 0.0  # % per month
    interest_method: Optional[str] = "Reducing Balance"
    installment_amount: float
    first_period: str                     # "YYYY-MM"

# -------------------------- Utilities --------------------------------

def _ym_to_date(ym: str) -> _date:
    y, m = ym.split("-")
    return _date(int(y), int(m), 28)  # safe day for month rollovers

from utils.loan_serializer import serialize_loan, serialize_advance

def _normalize(loan: LoanAdvance) -> dict:
    """Backward-compatible wrapper used in this module: returns the same
    normalized shape as before but using the safe serializer helpers.
    """
    out = serialize_loan(loan)
    # Align names used in this module (principal/amount etc.)
    out.setdefault("principal", out.get("principal_amount", 0.0))
    out.setdefault("first_period", getattr(loan, "first_period", "") or "")
    out.setdefault("repayment_period", int(getattr(loan, "repayment_period", 0) or 0))
    out.setdefault("next_due_period", getattr(loan, "next_due_period", "") or "")
    out.setdefault("schedule", [])
    return out


def _recompute_from_repayments(db, loan):
    from models.loan_repayment import LoanRepayment

    principal = float(getattr(loan, "principal_amount", getattr(loan, "principal", 0.0)) or 0.0)

    rows = (db.query(LoanRepayment)
              .filter(LoanRepayment.loan_id == loan.id)
              .order_by(LoanRepayment.period_ym.asc())
              .all())

    total_paid = sum(float(getattr(r, "amount", 0.0) or 0.0) for r in rows)
    balance = max(principal - total_paid, 0.0)

    # “next due” = month after the latest PAID period; if none, fall back to the anchor
    paid_periods = [r.period_ym for r in rows if getattr(r, "paid", False) and r.period_ym]
    if paid_periods:
        y, m = map(int, max(paid_periods).split("-"))
        m = 1 if m == 12 else m + 1
        y = y + 1 if m == 1 and max(paid_periods).endswith("-12") else y
        next_due = f"{y}-{m:02d}"
    else:
        next_due = getattr(loan, "first_period", "") or (
            getattr(loan, "next_due_date").strftime("%Y-%m") if getattr(loan, "next_due_date", None) else ""
        )

    # write back
    if hasattr(loan, "amount_repaid"): loan.amount_repaid = round(total_paid, 2)
    if hasattr(loan, "balance_outstanding"): loan.balance_outstanding = round(balance, 2)
    elif hasattr(loan, "balance"): loan.balance = round(balance, 2)
    if hasattr(loan, "next_due_period"): loan.next_due_period = next_due
    # Use 'Cleared' for paid-off loans to be consistent with schedule/status elsewhere
    if hasattr(loan, "status"): loan.status = "Cleared" if balance <= 0 else "Active"

    db.add(loan)


def _recompute_loan_state(db, loan):
    """
    Recalculate canonical loan fields from LoanRepayment audit rows.
    
    This is the SINGLE SOURCE OF TRUTH for loan balances.
    Always rebuilds from loan_repayments table to prevent data corruption.

    Sets/updates:
      - amount_repaid
      - balance_outstanding (or balance)
      - next_due_period (earliest unpaid period_ym) or next_due_date
      - status ('Cleared' when cleared else 'Active')
      - updated_at timestamp if present
    """
    try:
        # Get original principal amount
        principal = float(getattr(loan, "principal_amount", getattr(loan, "principal", 0.0)) or 0.0)
        
        # Sum what has actually been paid (SINGLE SOURCE OF TRUTH)
        total_paid = db.query(func.coalesce(func.sum(LoanRepayment.amount), 0.0)).filter(
            LoanRepayment.loan_id == loan.id, 
            LoanRepayment.paid == True
        ).scalar()
        total_paid = float(total_paid or 0.0)
        
        # Calculate balance from principal - repayments
        balance = max(principal - total_paid, 0.0)
        
        # Update amount_repaid
        loan.amount_repaid = total_paid
    except Exception:
        total_paid = 0.0
        balance = float(getattr(loan, "principal_amount", getattr(loan, "principal", 0.0)) or 0.0)
        try:
            loan.amount_repaid = total_paid
        except Exception:
            try:
                loan.repaid = total_paid
            except Exception:
                pass

    # Update balance_outstanding with calculated value
    try:
        if hasattr(loan, 'balance_outstanding'):
            loan.balance_outstanding = round(balance, 2)
        elif hasattr(loan, 'balance'):
            loan.balance = round(balance, 2)
    except Exception:
        pass

    # earliest unpaid period
    try:
        unpaid = (db.query(LoanRepayment.period_ym)
                    .filter(and_(LoanRepayment.loan_id == loan.id, LoanRepayment.paid != True))
                    .order_by(LoanRepayment.period_ym.asc())
                    .first())
        if unpaid and len(unpaid) > 0:
            loan.next_due_period = unpaid[0]
        else:
            # if none unpaid, clear next_due fields
            try:
                if hasattr(loan, 'next_due_period'):
                    loan.next_due_period = None
                if hasattr(loan, 'next_due_date'):
                    loan.next_due_date = None
            except Exception:
                pass
    except Exception:
        pass

    # Update status based on actual balance (not corrupted data)
    try:
        loan.status = 'Cleared' if balance <= 0.001 else 'Active'
    except Exception:
        pass

    try:
        if hasattr(loan, 'updated_at'):
            loan.updated_at = _dt.utcnow()
    except Exception:
        pass

    try:
        db.add(loan)
        # flush so callers can see updated values without full commit
        try:
            db.flush()
        except Exception:
            pass
    except Exception:
        pass


from datetime import date as _date

def _first_day_from_ym(ym: str) -> _date:
    y, m = map(int, ym.split("-"))
    return _date(y, m, 1)


def apply_payroll_advance_to_loans(db: Session, employee_id: int, period_ym: str, amount: float, payslip_id: int | None = None):
    """
    Distribute an `amount` (advance deducted on a payslip) across outstanding
    LoanAdvance rows for the employee and _upsert_ LoanRepayment audit rows for
    the exact `period_ym`. After inserting/updating repayment rows, recompute
    the canonical LoanAdvance fields from the full repayment history.

    This intentionally does NOT gate by next_due_period — it will create/update
    repayment rows for the given period and then recompute loan balances.
    """
    try:
        if not amount or float(amount or 0.0) <= 0:
            return {"applied": 0, "loans_touched": 0}

        Loan = LoanAdvance
        RP = LoanRepayment

        remaining = float(amount or 0.0)
        # load advances for the employee and filter in-Python to avoid SQLAlchemy
        # expression pitfalls on optional columns. We'll prefer advances that
        # mention 'advance' in loan_type (case-insensitive) and have balance > 0.
        advances = db.query(Loan).filter(Loan.employee_id == employee_id).all()
        filtered = []
        for a in (advances or []):
            try:
                bal = float(getattr(a, 'balance_outstanding', getattr(a, 'balance', 0.0)) or 0.0)
            except Exception:
                bal = 0.0
            lt = (getattr(a, 'loan_type', '') or '').lower()
            if bal > 0 and 'advance' in lt:
                filtered.append(a)
        # oldest next_due_date first, fallback by id
        try:
            filtered.sort(key=lambda x: ((getattr(x, 'next_due_date', None) or datetime.min), getattr(x, 'id', 0)))
        except Exception:
            filtered = filtered
        advances = filtered

        touched = set()
        applied_total = 0.0
        for adv in (advances or []):
            if remaining <= 0:
                break
            try:
                bal = float(getattr(adv, 'balance_outstanding', getattr(adv, 'balance', 0.0)) or 0.0)
            except Exception:
                bal = 0.0
            if bal <= 0:
                continue

            pay = round(min(bal, remaining), 2)
            if pay <= 0:
                continue

            # Upsert repayment row for this loan + period
            try:
                existing = db.query(RP).filter(RP.loan_id == adv.id, RP.period_ym == period_ym).first()
                if existing:
                    # Idempotent upsert policy:
                    # - If caller provided payslip_id, only replace the existing row when
                    #   the existing payslip_id is the same or is NULL (first insert lacked id).
                    # - If no payslip_id provided, treat this as a replace-for-period operation.
                    try:
                        existing_payslip = getattr(existing, 'payslip_id', None)
                    except Exception:
                        existing_payslip = None

                    try:
                        if payslip_id is not None:
                            # caller supplied a payslip id
                            if existing_payslip is None or int(existing_payslip) == int(payslip_id):
                                existing.amount = round(float(pay), 2)
                                existing.paid = True
                                existing.paid_on = _first_day_from_ym(period_ym)
                                try:
                                    existing.payslip_id = int(payslip_id)
                                except Exception:
                                    pass
                                db.add(existing)
                            else:
                                # existing repayment is associated with a different payslip; skip to avoid double-apply
                                pass
                        else:
                            # no payslip id: replace amount for the period
                            existing.amount = round(float(pay), 2)
                            existing.paid = True
                            existing.paid_on = _first_day_from_ym(period_ym)
                            db.add(existing)
                    except Exception:
                        import traceback; traceback.print_exc()
                else:
                    db.add(RP(
                        loan_id=adv.id,
                        reference_no=getattr(adv, 'reference_no', '') or '',
                        period_ym=period_ym,
                        amount=round(pay, 2),
                        paid=True,
                        paid_on=_first_day_from_ym(period_ym),
                        payslip_id=int(payslip_id) if payslip_id is not None else None
                    ))
            except Exception:
                import traceback; traceback.print_exc()

            remaining -= pay
            applied_total += pay
            touched.add(adv.id)

        # Recompute canonical loan rows from their full repayment history
        for loan_id in touched:
            ln = db.query(Loan).filter(Loan.id == loan_id).first()
            if ln:
                try:
                    # Use the canonical recompute helper which sums paid repayments
                    # and updates balance_outstanding/amount_repaid/next_due/status.
                    _recompute_loan_state(db, ln)
                except Exception:
                    import traceback; traceback.print_exc()

                # Ensure deterministic clearing behavior and next_due handling
                try:
                    # canonical period date for audit (first day of period)
                    period_dt = _first_day_from_ym(period_ym)
                except Exception:
                    period_dt = None

                try:
                    # update last deduction marker to period first day (audit)
                    if period_dt and hasattr(ln, 'last_deduction_date'):
                        ln.last_deduction_date = period_dt
                except Exception:
                    pass

                try:
                    new_bal = float(getattr(ln, 'balance_outstanding', getattr(ln, 'balance', 0.0)) or 0.0)
                except Exception:
                    new_bal = 0.0

                # next_due_date: null when cleared, otherwise push by ~1 month
                try:
                    if hasattr(ln, 'next_due_date'):
                        if new_bal <= 0:
                            try:
                                setattr(ln, 'next_due_date', None)
                            except Exception:
                                ln.next_due_date = None
                        else:
                            nd = getattr(ln, 'next_due_date', None)
                            if isinstance(nd, _date):
                                y = nd.year + (1 if nd.month == 12 else 0)
                                m = 1 if nd.month == 12 else nd.month + 1
                                d = min(getattr(nd, 'day', 1) or 1, 28)
                                ln.next_due_date = _date(y, m, d)
                            else:
                                # fallback: first day of next period
                                if period_dt:
                                    y = period_dt.year + (1 if period_dt.month == 12 else 0)
                                    m = 1 if period_dt.month == 12 else period_dt.month + 1
                                    ln.next_due_date = _date(y, m, 1)
                except Exception:
                    pass

                # status: Cleared if zero balance, otherwise Active
                try:
                    if hasattr(ln, 'status'):
                        ln.status = 'Cleared' if new_bal <= 0 else 'Active'
                except Exception:
                    pass

                db.add(ln)

        try:
            db.commit()
        except Exception:
            db.rollback()

        return {"applied": applied_total, "loans_touched": len(touched)}
    except Exception:
        import traceback; traceback.print_exc()
        try:
            db.rollback()
        except Exception:
            pass
        return {"applied": 0, "loans_touched": 0}

# -------------------- Repayment application (Payroll) ----------------

def repay_loans_for_employee_batch(db: Session, batch: RepaymentBatch) -> None:
    if batch is None:
        return

    staff_no = getattr(batch, "staff_no", None)
    if not staff_no:
        return

    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        return

    for it in (batch.repayments or []):
        try:
            ref = getattr(it, "reference_no", None)
            amt = float(getattr(it, "installment", 0) or 0)
            if not ref or amt <= 0:
                continue

            loan = db.query(LoanAdvance).filter(
                LoanAdvance.employee_id == emp.id,
                LoanAdvance.reference_no == ref
            ).first()
            if not loan:
                continue

            current_repaid = float(getattr(loan, "amount_repaid", getattr(loan, "repaid", 0.0)) or 0.0)
            current_bal = float(getattr(loan, "balance_outstanding", getattr(loan, "balance", 0.0)) or 0.0)

            new_repaid = round(current_repaid + amt, 2)
            new_bal = round(max(current_bal - amt, 0.0), 2)

            if hasattr(loan, "amount_repaid"):
                loan.amount_repaid = new_repaid
            if hasattr(loan, "repaid"):
                loan.repaid = new_repaid

            if hasattr(loan, "balance_outstanding"):
                loan.balance_outstanding = new_bal
            if hasattr(loan, "balance"):
                loan.balance = new_bal

            if new_bal <= 0 and hasattr(loan, "status"):
                loan.status = "Cleared"

            # Upsert audit row in loans_repayment for the payroll period
            period_ym = getattr(it, "period_ym", None) or getattr(it, "period", None) or ""
            try:
                existing = None
                if period_ym:
                    existing = db.query(LoanRepayment).filter(
                        LoanRepayment.loan_id == loan.id,
                        LoanRepayment.period_ym == period_ym
                    ).first()
                if existing:
                    existing.amount = round(float(existing.amount or 0.0) + amt, 2)
                else:
                    db.add(LoanRepayment(
                        loan_id=loan.id,
                        reference_no=loan.reference_no,
                        period_ym=period_ym or datetime.utcnow().strftime("%Y-%m"),
                        amount=round(amt, 2)
                    ))
            except Exception:
                import traceback; traceback.print_exc()

            # Optional journal posting
            try:
                settings = None
                try:
                    settings = db.query(models.AccountSettings).first()
                except Exception:
                    settings = None

                def _resolve_from_settings_or_name(setting_field: str, fallback_name: str):
                    if settings:
                        val = getattr(settings, setting_field, None)
                        if val:
                            try:
                                aid = int(val)
                                a = db.query(Account).filter(Account.id == aid).first()
                                if a: return a.id
                            except Exception:
                                pass
                            a = db.query(Account).filter(
                                (Account.account_code == str(val)) | (Account.name == str(val))
                            ).first()
                            if a: return a.id
                    a = db.query(Account).filter(Account.name == fallback_name).first()
                    return a.id if a is not None else None

                emp_clearing_id = _resolve_from_settings_or_name('employee_clearing_account_id', 'Employee clearing account')
                loans_asset_id  = _resolve_from_settings_or_name('loans_asset_account_id', 'Loans and Advances to Staff')

                if emp_clearing_id and loans_asset_id:
                    db.add(JournalEntry(
                        date=datetime.utcnow().date(),
                        narration=f"Loan repayment {loan.reference_no} by {emp.staff_no}",
                        reference=f"LOAN-REPAY-{loan.reference_no}-{period_ym or datetime.utcnow().strftime('%Y-%m')}",
                        lines=[
                            JournalLine(account_id=emp_clearing_id, debit=round(amt, 2), credit=0, narration=f"Repayment from payroll for {emp.staff_no}"),
                            JournalLine(account_id=loans_asset_id,  debit=0, credit=round(amt, 2), narration=f"Reduce loan receivable {loan.reference_no}")
                        ]
                    ))
            except Exception:
                import traceback; traceback.print_exc()

        except Exception:
            import traceback; traceback.print_exc()

    try:
        db.commit()
    except Exception:
        db.rollback()

def repay_loans_for_employee_period(db: Session, staff_no: str, period_ym: str, payslip_id: int | None = None):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        return {"updated": 0}

    try:
        period_dt = _ym_to_date(period_ym)
    except Exception:
        period_dt = None

    repayments = (
        db.query(LoanRepayment)
          .join(LoanAdvance, LoanRepayment.loan_id == LoanAdvance.id)
          .filter(LoanAdvance.employee_id == emp.id, LoanRepayment.period_ym == period_ym)
          .all()
    )
    if not repayments:
        return {"updated": 0}

    touched = set()
    for rp in repayments:
        loan = db.query(LoanAdvance).filter(LoanAdvance.id == rp.loan_id, LoanAdvance.employee_id == emp.id).first()
        if not loan:
            continue

        try:
            if period_dt and getattr(loan, 'last_deduction_date', None) == period_dt:
                continue
        except Exception:
            pass

        amt = float(getattr(rp, 'amount', 0.0) or 0.0)
        if amt <= 0:
            continue

        current_repaid = float(getattr(loan, 'amount_repaid', getattr(loan, 'repaid', 0.0)) or 0.0)
        current_bal   = float(getattr(loan, 'balance_outstanding', getattr(loan, 'balance', 0.0)) or 0.0)
        new_repaid = round(current_repaid + amt, 2)
        new_bal    = round(max(current_bal - amt, 0.0), 2)

        if hasattr(loan, 'amount_repaid'): loan.amount_repaid = new_repaid
        if hasattr(loan, 'repaid'):        loan.repaid        = new_repaid
        if hasattr(loan, 'balance_outstanding'): loan.balance_outstanding = new_bal
        if hasattr(loan, 'balance'):             loan.balance             = new_bal
        if hasattr(loan, 'last_deduction_date') and period_dt: loan.last_deduction_date = period_dt
        if payslip_id and hasattr(loan, 'payslip_number'):
            try: loan.payslip_number = str(payslip_id)
            except Exception: pass
        if new_bal <= 0 and hasattr(loan, 'status'): loan.status = 'Cleared'

        db.add(loan)
        touched.add(loan.reference_no)

        try:
            rp.paid = True
            rp.paid_on = period_dt or _first_day_from_ym(period_ym)
            if payslip_id is not None:
                rp.payslip_id = payslip_id
            db.add(rp)
            # Recompute loan header now that this repayment row is marked paid
            try:
                try:
                    db.flush()
                except Exception:
                    pass
                from routes import employee_loans as _emp_loans
            except Exception:
                _emp_loans = None
            try:
                if _emp_loans and hasattr(_emp_loans, '_recompute_loan_state'):
                    _emp_loans._recompute_loan_state(db, loan)
            except Exception:
                pass
        except Exception:
            pass

    for ref in touched:
        loan = db.query(LoanAdvance).filter(LoanAdvance.employee_id == emp.id, LoanAdvance.reference_no == ref).first()
        if not loan:
            continue

        next_unpaid = (
            db.query(LoanRepayment)
              .filter(LoanRepayment.loan_id == loan.id, LoanRepayment.period_ym != None)
              .order_by(LoanRepayment.period_ym.asc())
              .first()
        )
        try:
            loan.next_due_period = next_unpaid.period_ym if next_unpaid else ""
        except Exception:
            try:
                loan.next_due_date = None
            except Exception:
                pass

        bal = float(getattr(loan, 'balance_outstanding', getattr(loan, 'balance', 0.0)) or 0.0)
        try:
            loan.balance_outstanding = bal
        except Exception:
            try:
                loan.balance = bal
            except Exception:
                pass

        try:
            loan.status = 'Cleared' if bal <= 0 else 'Active'
        except Exception:
            pass

        db.add(loan)

    db.commit()
    return {"updated": len(repayments)}

def repay_loans_for_employee(db: Session, *args, **kwargs):
    if 'batch' in kwargs:
        return repay_loans_for_employee_batch(db, kwargs.get('batch'))
    if len(args) >= 2 and hasattr(args[1], 'repayments'):
        return repay_loans_for_employee_batch(db, args[1])

    staff_no  = kwargs.get('staff_no')  if 'staff_no'  in kwargs else (args[1] if len(args) >= 2 else None)
    period_ym = kwargs.get('period_ym') if 'period_ym' in kwargs else (args[2] if len(args) >= 3 else None)
    payslip_id= kwargs.get('payslip_id')if 'payslip_id'in kwargs else (args[3] if len(args) >= 4 else None)
    if staff_no and period_ym:
        return repay_loans_for_employee_period(db, staff_no=staff_no, period_ym=period_ym, payslip_id=payslip_id)
    return None

# ----------------------------- Endpoints ------------------------------

@router.get("/{staff_no}/loans")
def list_loans_for_employee(staff_no: str, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Read loan_advances via raw SQL to avoid ORM Date/processor errors on legacy data
    from types import SimpleNamespace
    from sqlalchemy import text
    try:
        res = db.execute(text("SELECT * FROM loan_advances WHERE employee_id = :eid ORDER BY id"), {"eid": emp.id}).fetchall()
    except Exception:
        res = []
    rows = []
    for r in res:
        try:
            rows.append(SimpleNamespace(**dict(r._mapping)))
        except Exception:
            try:
                rows.append(SimpleNamespace(**dict(r)))
            except Exception:
                pass

    for L in rows:
        bal = float(getattr(L, "balance_outstanding", getattr(L, "balance", 0.0)) or 0.0)
        try:    L.status = "Cleared" if bal <= 0 else "Active"
        except: pass

    out = []
    for L in rows:
        norm = _normalize(L)

        try:
                rps = (
                    db.query(LoanRepayment)
                      .filter(LoanRepayment.loan_id == L.id)
                      .order_by(LoanRepayment.period_ym.asc())  # ascending order to build schedule progressively
                      .all()
                )
                sched = []
                opening = float(getattr(L, 'principal_amount', getattr(L, 'principal', 0.0)) or 0.0)

                for rp in rps:
                    amt = float(getattr(rp, 'amount', 0.0) or 0.0)
                    closing = round(max(opening - amt, 0.0), 2)

                    paid_on_val = getattr(rp, 'paid_on', None)
                    try:
                        paid_on = paid_on_val.isoformat() if hasattr(paid_on_val, 'isoformat') else (str(paid_on_val) if paid_on_val is not None else '')
                    except Exception:
                        paid_on = ''

                    payslip_id_val = getattr(rp, 'payslip_id', None)
                    try:
                        payslip_id = int(payslip_id_val) if payslip_id_val is not None else None
                    except Exception:
                        payslip_id = None

                    sched.append({
                        'period_ym': getattr(rp, 'period_ym', '') or '',
                        'opening': round(opening, 2),
                        'interest': 0.0,
                        'principal': round(amt, 2),
                        'installment': round(amt, 2),
                        'closing': closing,
                        'paid': bool(getattr(rp, 'paid', False)),
                        'paid_on': paid_on,
                        'payslip_id': payslip_id,
                    })

                    opening = closing  # move to next period

                # ensure current balance/status sync
                norm['schedule'] = sched
                norm['balance_outstanding'] = round(opening, 2)
                norm['balance'] = round(opening, 2)
                norm['status'] = 'Cleared' if opening <= 0 else 'Active'
        except Exception:
            norm['schedule'] = norm.get('schedule', [])

        out.append(norm)

    # Calculate totals for all loans/advances
    total_principal = sum(float(loan.get('principal_amount', 0) or 0) for loan in out)
    total_repaid = sum(float(loan.get('amount_repaid', 0) or 0) for loan in out)
    total_balance = sum(float(loan.get('balance_outstanding', 0) or 0) for loan in out)
    
    # Count active vs cleared
    active_count = sum(1 for loan in out if loan.get('status') == 'Active')
    cleared_count = sum(1 for loan in out if loan.get('status') == 'Cleared')
    
    return {
        'loans': out,
        'totals': {
            'total_loans': len(out),
            'active_loans': active_count,
            'cleared_loans': cleared_count,
            'total_principal': round(total_principal, 2),
            'total_repaid': round(total_repaid, 2),
            'total_balance': round(total_balance, 2)
        }
    }

@router.get("/{staff_no}/repayments")
def list_repayments_for_employee(staff_no: str, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    try:
        rows = (
            db.query(models.LoanRepayment, models.LoanAdvance)
              .join(models.LoanAdvance, models.LoanRepayment.loan_id == models.LoanAdvance.id)
              .filter(models.LoanAdvance.employee_id == emp.id)
              .order_by(models.LoanRepayment.period_ym.desc())
              .all()
        )

        out = []
        for rp, loan in rows:
            paid_on = getattr(rp, "paid_on", None)
            out.append({
                "loan_id": getattr(loan, "id", None),
                "reference_no": getattr(rp, "reference_no", None) or getattr(loan, "reference_no", None),
                "period_ym": getattr(rp, "period_ym", "") or "",
                "amount": float(getattr(rp, "amount", 0) or 0),
                "paid": bool(getattr(rp, "paid", False)),
                "paid_on": paid_on.isoformat() if hasattr(paid_on, "isoformat") else (str(paid_on) if paid_on else ""),
                "payslip_id": int(getattr(rp, "payslip_id")) if getattr(rp, "payslip_id", None) is not None else None,
            })
        return out
    except Exception:
        # Fallback to raw SQL join to avoid Date/processor errors when materializing
        # full ORM objects for loan_advances which may contain legacy empty-string
        # date values.
        from sqlalchemy import text
        sql = '''
        SELECT lr.id as id, lr.loan_id, lr.reference_no as reference_no, lr.period_ym, lr.amount, lr.paid, lr.paid_on, lr.payslip_id
        FROM loan_repayments lr
        JOIN loan_advances la ON la.id = lr.loan_id
        WHERE la.employee_id = :eid
        ORDER BY lr.period_ym desc
        '''
        rows = db.execute(text(sql), {"eid": emp.id}).fetchall()
        out = []
        for r in rows:
            try:
                rec = dict(r._mapping)
            except Exception:
                try:
                    rec = dict(r)
                except Exception:
                    rec = {}
            paid_on = rec.get('paid_on', None)
            out.append({
                "loan_id": rec.get('loan_id'),
                "reference_no": rec.get('reference_no') or '',
                "period_ym": rec.get('period_ym') or '',
                "amount": float(rec.get('amount') or 0),
                "paid": bool(rec.get('paid', False)),
                "paid_on": (paid_on.isoformat() if hasattr(paid_on, 'isoformat') else (str(paid_on) if paid_on else '')),
                "payslip_id": int(rec.get('payslip_id')) if rec.get('payslip_id') is not None else None,
            })
        return out


@router.post("/{staff_no}/repayments/run")
def run_repayments_now(staff_no: str, period_ym: str, payslip_id: int | None = None, db: Session = Depends(get_db)):
    """Idempotent: re-run repayment application for a staff and period. Useful for testing/debugging.

    Example: POST /employees/TNL009/repayments/run?period_ym=2025-07&payslip_id=39
    """
    # Delegate to the internal helper which applies repayment audit rows to LoanAdvance
    return repay_loans_for_employee_period(db, staff_no=staff_no, period_ym=period_ym, payslip_id=payslip_id)


# NOTE: debug endpoint for repayments removed. Use scripts/ or DB queries
# during development to inspect repayment rows. This keeps the public API
# surface minimal and avoids exposing debug internals.

@router.post("/{staff_no}/repayments")
def apply_repayments_for_employee(staff_no: str, batch: RepaymentBatch, db: Session = Depends(get_db)):
    try:
        batch.staff_no = staff_no
    except Exception:
        pass
    repay_loans_for_employee(db=db, batch=batch)
    return {"ok": True}

@router.post("/{staff_no}/loans")
def create_loan_for_employee(staff_no: str, body: LoanCreate, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    exists = db.query(LoanAdvance).filter(LoanAdvance.reference_no == body.reference_no).first()
    if exists:
        raise HTTPException(status_code=400, detail="Reference already exists")

    try:
        first_dt = _ym_to_date(body.first_period) if getattr(body, 'first_period', None) else None
    except Exception:
        first_dt = None

    loan = LoanAdvance(
        employee_id=emp.id,
        loan_type=body.type,
        reference_no=body.reference_no,
        date_issued=body.date_issued,
        principal_amount=round(body.principal, 2),
        interest_rate=body.interest_rate or 0.0,
        repayment_period=int(getattr(body, 'repayment_period', 0) or 0),
        installment_amount=round(body.installment_amount, 2),
        deduction_method=getattr(body, 'interest_method', None) or "Payroll Deduction",
        amount_repaid=0.0,
        balance_outstanding=round(body.principal, 2),
        status="Active",
        next_due_date=first_dt,
        created_at=datetime.utcnow()
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    try:
        _recompute_loan_state(db, loan)
    except Exception:
        pass
    return _normalize(loan)


@router.put("/{staff_no}/loans/{reference_no}")
def update_loan_for_employee(staff_no: str, reference_no: str, body: LoanCreate, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    loan = db.query(LoanAdvance).filter(
        LoanAdvance.employee_id == emp.id,
        LoanAdvance.reference_no == reference_no
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    # update editable fields
    try:
        loan.loan_type = body.type
    except Exception:
        try: loan.type = body.type
        except Exception: pass
    try:
        loan.date_issued = body.date_issued
    except Exception:
        pass
    try:
        loan.principal_amount = round(body.principal, 2)
    except Exception:
        pass
    try:
        loan.interest_rate = body.interest_rate or 0.0
    except Exception:
        pass
    try:
        loan.deduction_method = body.interest_method or "Payroll Deduction"
    except Exception:
        pass
    try:
        loan.installment_amount = round(body.installment_amount, 2)
    except Exception:
        pass

    # reset schedule anchor / next due
    try:
        if getattr(body, 'first_period', None):
            loan.next_due_date = _ym_to_date(body.first_period)
    except Exception:
        pass

    # if principal changed and nothing repaid yet, recompute outstanding balance
    try:
        repaid = float(getattr(loan, "amount_repaid", 0.0) or 0.0)
    except Exception:
        repaid = 0.0
    try:
        if repaid == 0.0:
            loan.balance_outstanding = round(body.principal, 2)
    except Exception:
        try:
            loan.balance = round(body.principal, 2)
        except Exception:
            pass

    db.add(loan)
    db.commit()
    db.refresh(loan)
    try:
        _recompute_loan_state(db, loan)
    except Exception:
        pass
    return {"ok": True}

@router.post("/{staff_no}/loans/recalculate")
def recalculate_loans_for_employee(staff_no: str, db: Session = Depends(get_db)):
    """Recalculate all loan balances from loan_repayments (single source of truth)."""
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    loans = db.query(LoanAdvance).filter(LoanAdvance.employee_id == emp.id).all()
    
    recalculated = 0
    for loan in loans:
        try:
            _recompute_loan_state(db, loan)
            db.add(loan)
            recalculated += 1
        except Exception:
            continue
    
    db.commit()
    return {"recalculated": recalculated, "message": f"Recalculated {recalculated} loans for {staff_no}"}

@router.delete("/{staff_no}/loans/{reference_no}")
def delete_loan_for_employee(staff_no: str, reference_no: str, db: Session = Depends(get_db)):
    emp = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    loan = db.query(LoanAdvance).filter(
        LoanAdvance.employee_id == emp.id,
        LoanAdvance.reference_no == reference_no
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    # Delete dependent loan repayment records first to avoid foreign key constraint violation
    try:
        db.query(LoanRepayment).filter(LoanRepayment.loan_id == loan.id).delete()
    except Exception:
        # LoanRepayment model may not exist in all environments
        try:
            from sqlalchemy import text
            db.execute(text("DELETE FROM loan_repayments WHERE loan_id = :loan_id"), {"loan_id": loan.id})
        except Exception:
            pass
    
    # Now delete the loan
    db.delete(loan)
    db.commit()
    return {"ok": True}
