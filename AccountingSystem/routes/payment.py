# routes/payment.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models
from models.payment import SupplierPayment
from models.employee import Employee  # Add this import
from models.payment_line import PaymentLine  # Add this import
from schemas.payment import SupplierPaymentCreate, SupplierPaymentResponse, PaymentListOut
from routes.journal import post_journal_entry  # Import the helper

router = APIRouter(prefix="/payments", tags=["Payments"])

@router.post("/", response_model=SupplierPaymentResponse)
def create_payment(payload: SupplierPaymentCreate, db: Session = Depends(get_db)):
    payment = SupplierPayment(
        payee_type=payload.payee_type,
        supplier_id=payload.supplier_id,
        customer_id=payload.customer_id,
        other_payee=payload.other_payee,
        staff_id=payload.staff_id,
        payment_date=payload.date,
        bank_account_id=payload.bank_account_id if payload.bank_account_id != "employee_claim" else None,
        reference=payload.reference,
        narration=payload.narration,
        mode=payload.mode,
        wht_amount=payload.wht_amount,
        amount=sum([ln.amount_applied for ln in payload.lines]),
        status="Posted",
        gross_amount=sum([ln.amount_applied for ln in payload.lines]),
        cash_paid=sum([ln.amount_applied for ln in payload.lines]),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    # Save payment lines
    total_invoice = 0.0
    for ln in payload.lines:
        payment_line = PaymentLine(
            payment_id=payment.id,
            purchase_id=ln.purchase_id,
            amount_applied=ln.amount_applied,
            account_id=ln.account_id
        )
        db.add(payment_line)
        total_invoice += ln.amount_applied
    # Save bank charge line if present
    bank_charge_amount = 0.0
    bank_charge_account_code = None
    if hasattr(payload, "bank_charge") and payload.bank_charge and payload.bank_charge["amount"]:
        bank_charge_line = PaymentLine(
            payment_id=payment.id,
            purchase_id=None,
            amount_applied=payload.bank_charge["amount"],
            account_id=payload.bank_charge["account_id"]
        )
        db.add(bank_charge_line)
        bank_charge_amount = payload.bank_charge["amount"]
        # You may need to fetch the account code from the account_id
        bank_charge_account = db.query(models.Account).filter(models.Account.id == payload.bank_charge["account_id"]).first()
        if bank_charge_account:
            bank_charge_account_code = bank_charge_account.account_code
    db.commit()

    # --- Journal Posting Logic ---
    journal_lines = []
    # Dr Accounts Payable (total invoice amount)
    journal_lines.append({
        "account_code": "ACCOUNTS_PAYABLE",  # Replace with your actual AP account code
        "narration": f"Payment for invoices (Payment ID {payment.id})",
        "debit": total_invoice,
        "credit": 0.0
    })
    # Dr Bank Charges (if any)
    if bank_charge_amount > 0 and bank_charge_account_code:
        journal_lines.append({
            "account_code": bank_charge_account_code,
            "narration": f"Bank charges for Payment ID {payment.id}",
            "debit": bank_charge_amount,
            "credit": 0.0
        })
    # Cr Bank/Cash or Employee Claims
    if payload.bank_account_id == "employee_claim":
        journal_lines.append({
            "account_code": "EMPLOYEE_CLAIMS",  # Replace with your actual Employee Claims account code
            "narration": f"Paid by staff for Payment ID {payment.id}",
            "debit": 0.0,
            "credit": total_invoice + bank_charge_amount
        })
    else:
        # Fetch bank/cash account code
        bank_account = db.query(models.Account).filter(models.Account.id == payload.bank_account_id).first()
        bank_account_code = bank_account.account_code if bank_account else "BANK"
        journal_lines.append({
            "account_code": bank_account_code,
            "narration": f"Paid from bank/cash for Payment ID {payment.id}",
            "debit": 0.0,
            "credit": total_invoice + bank_charge_amount
        })

    post_journal_entry(
        db=db,
        date=payment.payment_date,
        reference=payment.reference,
        narration=payment.narration,
        lines=journal_lines
    )

    return payment

@router.get("/", response_model=List[PaymentListOut])
def list_payments(
    db: Session = Depends(get_db),
    supplier_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    payee_type: Optional[str] = None,
):
    query = db.query(SupplierPayment)
    if supplier_id:
        query = query.filter(SupplierPayment.supplier_id == supplier_id)
    if customer_id:
        query = query.filter(SupplierPayment.customer_id == customer_id)
    if payee_type:
        query = query.filter(SupplierPayment.payee_type == payee_type)
    payments = query.order_by(SupplierPayment.payment_date.desc(), SupplierPayment.id.desc()).all()
    payment_rows = [
        PaymentListOut(
            id=p.id,
            date=str(p.payment_date),
            amount=p.amount,
            payee_type=p.payee_type,
            supplier_id=p.supplier_id,
            customer_id=p.customer_id,
            other_payee=p.other_payee,
            staff_id=p.staff_id,
            bank_account_id=p.bank_account_id,
            reference=p.reference,
            narration=p.narration,
            mode=p.mode,
            status=p.status,
            supplier_name=p.supplier.name if p.supplier else None,
            customer_name=p.customer.name if hasattr(p, "customer") and p.customer else None,
            staff_name=p.staff.name if hasattr(p, "staff") and p.staff else None,
            source="supplier_payment",
        )
        for p in payments
    ]
    # ...merge with bank withdrawals if needed...
    return payment_rows

@router.get("/staff", response_model=List[dict])
def list_staff(db: Session = Depends(get_db)):
    staff = db.query(Employee).all()
    return [{"id": s.id, "name": s.name, "staff_no": s.staff_no} for s in staff]
