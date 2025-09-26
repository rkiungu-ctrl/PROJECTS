from datetime import datetime, date as _date, date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, aliased
from sqlalchemy import or_, func
from typing import List, Optional
import csv, io
from fastapi.responses import StreamingResponse

from database import get_db
from models import BankTransaction, PaymentReceipt, Invoice, Account, Customer
from pydantic import BaseModel

router = APIRouter(prefix="/receipts", tags=["Receipts"])

# ---------- DTOs ----------
class ReceiptOut(BaseModel):
    id: int
    date: Optional[str] = None
    reference: Optional[str] = None
    narration: Optional[str] = None
    amount: float
    bank_account_id: Optional[int] = None
    bank_name: Optional[str] = None
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    customer_name: Optional[str] = None
    counter_account_id: Optional[int] = None
    counter_account_name: Optional[str] = None
    source: str  # "payment_receipt" or "bank_tx"
    class Config:
        orm_mode = True

def _to_str_date(d) -> Optional[str]:
    return None if d is None else str(d)

def _to_date(value) -> _date | None:
    if value is None:
        return None
    if isinstance(value, _date):
        return value
    if isinstance(value, datetime):
        return value.date()
    # accept 'YYYY-MM-DD' from <input type="date">
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid date: {value!r}")

# ---------- helpers ----------
def find_ids_by_keywords(db: Session, keywords: List[str]) -> List[int]:
    conds = (
        [func.lower(Account.name).like(f"%{p}%") for p in keywords] +
        [func.lower(Account.category).like(f"%{p}%") for p in keywords] +
        [func.lower(Account.sub_category).like(f"%{p}%") for p in keywords] +
        [func.lower(Account.type).like(f"%{p}%") for p in keywords]
    )
    return [r[0] for r in db.query(Account.id).filter(or_(*conds)).all()]

def get_ar_account_id(db: Session) -> Optional[int]:
    ids = find_ids_by_keywords(db, ["receivable", "receivables", "debtors", "debtors control", "customer"])
    return ids[0] if ids else None

def find_suspense_account_ids(db: Session) -> List[int]:
    return find_ids_by_keywords(db, ["suspense", "uncleared", "clearing", "unreconciled"])

def is_bank(db: Session, account_id: Optional[int]) -> bool:
    if not account_id:
        return False
    a = db.query(Account).filter(Account.id == account_id).first()
    if not a:
        return False
    blob = " ".join([(a.type or ""), (a.category or ""), (a.sub_category or ""), (a.name or "")]).lower()
    return any(w in blob for w in ["bank", "cash", "mpesa", "paybill", "wallet"])

def find_bank_account_ids(db: Session) -> List[int]:
    keywords = ["bank", "cash", "mpesa", "paybill", "wallet", "petty cash"]
    conds = (
        [func.lower(Account.name).like(f"%{k}%") for k in keywords] +
        [func.lower(Account.category).like(f"%{k}%") for k in keywords] +
        [func.lower(Account.sub_category).like(f"%{k}%") for k in keywords] +
        [func.lower(Account.type).like(f"%{k}%") for k in keywords]
    )
    return [r[0] for r in db.query(Account.id).filter(or_(*conds)).all()]

# ---------- READ: merged receipts ----------
@router.get("/", response_model=List[ReceiptOut])
def list_receipts(
    db: Session = Depends(get_db),
    include_uncategorized: bool = True,
):
    results: List[ReceiptOut] = []

    # 1) PaymentReceipt rows (legacy)
    PR, INV, ACC, CUS = PaymentReceipt, Invoice, Account, Customer
    pr_rows = (
        db.query(
            PR.id.label("id"),
            PR.date.label("date"),
            PR.reference.label("reference"),
            PR.narration.label("narration"),
            PR.amount.label("amount"),
            PR.bank_account_id.label("bank_account_id"),
            ACC.name.label("bank_name"),
            PR.invoice_id.label("invoice_id"),
            INV.invoice_number.label("invoice_number"),
            CUS.name.label("customer_name"),
        )
        .outerjoin(INV, INV.id == PR.invoice_id)
        .outerjoin(CUS, CUS.id == INV.customer_id)
        .outerjoin(ACC, ACC.id == PR.bank_account_id)
        .order_by(PR.date.desc(), PR.id.desc())
        .all()
    )
    for r in pr_rows:
        results.append(ReceiptOut(
            id=r.id,
            date=_to_str_date(r.date),
            reference=r.reference,
            narration=r.narration,
            amount=float(r.amount or 0),
            bank_account_id=r.bank_account_id,
            bank_name=r.bank_name,
            invoice_id=r.invoice_id,
            invoice_number=r.invoice_number,
            customer_name=r.customer_name,
            counter_account_id=None,
            counter_account_name=None,
            source="payment_receipt",
        ))

    # 2) BankTransaction deposits (any counter account)
    BT, ACC2 = BankTransaction, aliased(Account)

    bank_ids = find_bank_account_ids(db)  # receiving accounts that are Bank/Cash
    if not bank_ids:
        return results  # no bank accounts defined -> nothing to show

    bt_q = (
        db.query(
            BT.id.label("id"),
            BT.date.label("date"),
            BT.reference.label("reference"),
            BT.narration.label("narration"),
            BT.amount.label("amount"),
            BT.account_id.label("bank_account_id"),
            ACC.name.label("bank_name"),
            BT.counter_account_id.label("counter_account_id"),
            ACC2.name.label("counter_account_name"),
        )
        .join(ACC, ACC.id == BT.account_id)          # the receiving bank
        .outerjoin(ACC2, ACC2.id == BT.counter_account_id)
        .filter(BT.account_id.in_(bank_ids))         # <-- deposit into a bank
    )

    # 'deposit' semantics
    if hasattr(BT, "is_deposit"):
        bt_q = bt_q.filter(BT.is_deposit == True)
    elif hasattr(BT, "type"):
        bt_q = bt_q.filter(func.lower(BT.type).in_(["deposit", "credit", "inflow"]))
    else:
        bt_q = bt_q.filter(BT.amount > 0)

    bt_rows = bt_q.order_by(BT.date.desc(), BT.id.desc()).all()

    for r in bt_rows:
        results.append(ReceiptOut(
            id=r.id,
            date=_to_str_date(r.date),
            reference=r.reference,
            narration=r.narration,
            amount=float(r.amount or 0),
            bank_account_id=r.bank_account_id,
            bank_name=r.bank_name,
            invoice_id=None,
            invoice_number=None,
            customer_name=None,
            counter_account_id=r.counter_account_id,
            counter_account_name=r.counter_account_name,  # shows in "Counter / From"
            source="bank_tx",
        ))

    results.sort(key=lambda x: (x.date or "", x.id), reverse=True)
    return results

# ---------- WRITE (BankTransaction) ----------
class ReceiptIn(BaseModel):
    # common
    date: date
    amount: float
    reference: Optional[str] = None
    narration: Optional[str] = None
    mode: Optional[str] = "account"  # 'account' | 'invoice' | 'transfer'

    # account/invoice
    bank_account_id: Optional[int] = None
    account_id: Optional[int] = None           # COA account (or another bank)
    counter_account_id: Optional[int] = None   # alias accepted
    invoice_number: Optional[str] = None       # optional, for reference text

    # transfer
    from_bank_account_id: Optional[int] = None
    to_bank_account_id: Optional[int] = None

    class Config:
        extra = "ignore"

class BatchDeleteIn(BaseModel):
    ids: List[int]

@router.post("/")
def create_receipt(data: ReceiptIn, db: Session = Depends(get_db)):
    if data.amount is None or data.amount <= 0:
        raise HTTPException(400, "Amount must be positive.")

    # TRANSFER
    if (data.mode or "account") == "transfer":
        if not data.from_bank_account_id or not data.to_bank_account_id:
            raise HTTPException(400, "from_bank_account_id and to_bank_account_id are required for transfer.")
        if not is_bank(db, data.from_bank_account_id) or not is_bank(db, data.to_bank_account_id):
            raise HTTPException(400, "Both from/to must be bank accounts.")

        withdraw = BankTransaction(
            date=_to_date(data.date),  # <-- convert here
            reference=data.reference,
            narration=data.narration or "Inter-account transfer (out)",
            account_id=data.from_bank_account_id,
            counter_account_id=data.to_bank_account_id,
        )
        if hasattr(BankTransaction, "type"):
            withdraw.type = "withdrawal"; withdraw.amount = data.amount
        else:
            withdraw.amount = -data.amount

        deposit = BankTransaction(
            date=_to_date(data.date),  # <-- convert here
            reference=data.reference,
            narration=data.narration or "Inter-account transfer (in)",
            amount=data.amount,
            account_id=data.to_bank_account_id,
            counter_account_id=data.from_bank_account_id,
        )
        if hasattr(BankTransaction, "type"): deposit.type = "deposit"

        db.add_all([withdraw, deposit]); db.commit()
        return {"message": "Transfer recorded.", "withdraw_id": withdraw.id, "deposit_id": deposit.id}

    # INVOICE (to AR)
    if (data.mode or "account") == "invoice":
        if not data.bank_account_id:
            raise HTTPException(400, "bank_account_id is required.")
        ar_id = get_ar_account_id(db)
        if not ar_id:
            raise HTTPException(400, "Accounts Receivable account not found.")
        tx = BankTransaction(
            date=_to_date(data.date),  # <-- convert here
            reference=data.reference or (data.invoice_number and f"Payment for {data.invoice_number}") or None,
            narration=data.narration,
            amount=data.amount,
            account_id=data.bank_account_id,
            counter_account_id=ar_id,
        )
        if hasattr(BankTransaction, "type"): tx.type = "deposit"
        db.add(tx); db.commit(); db.refresh(tx)
        return {"id": tx.id, "message": "Invoice receipt posted to Accounts Receivable."}

    # ACCOUNT (normal deposit)
    if not data.bank_account_id:
        raise HTTPException(400, "bank_account_id is required.")
    coaid = data.account_id or data.counter_account_id

    # treat as transfer if COA is another bank
    if is_bank(db, coaid) and coaid != data.bank_account_id:
        withdraw = BankTransaction(
            date=_to_date(data.date),  # <-- convert here
            reference=data.reference,
            narration=data.narration or "Inter-account transfer (out)",
            account_id=coaid,
            counter_account_id=data.bank_account_id,
        )
        if hasattr(BankTransaction, "type"):
            withdraw.type = "withdrawal"; withdraw.amount = data.amount
        else:
            withdraw.amount = -data.amount

        deposit = BankTransaction(
            date=_to_date(data.date),  # <-- convert here
            reference=data.reference,
            narration=data.narration or "Inter-account transfer (in)",
            amount=data.amount,
            account_id=data.bank_account_id,
            counter_account_id=coaid,
        )
        if hasattr(BankTransaction, "type"): deposit.type = "deposit"
        db.add_all([withdraw, deposit]); db.commit(); db.refresh(deposit)
        return {"id": deposit.id, "message": "Transfer recorded."}

    tx = BankTransaction(
        date=_to_date(data.date),  # <-- convert here
        reference=data.reference,
        narration=data.narration,
        amount=data.amount,
        account_id=data.bank_account_id,
        counter_account_id=coaid,
    )
    if hasattr(BankTransaction, "type"): tx.type = "deposit"
    db.add(tx); db.commit(); db.refresh(tx)
    return {"id": tx.id, "message": "Receipt saved."}

@router.put("/{receipt_id}")
def update_receipt(receipt_id: int, data: ReceiptIn, db: Session = Depends(get_db)):
    tx = db.query(BankTransaction).filter(BankTransaction.id == receipt_id).first()
    if not tx: raise HTTPException(404, "Receipt not found.")
    coaid = data.account_id or data.counter_account_id

    # create mirror when switching to bank
    if is_bank(db, coaid) and coaid != (data.bank_account_id or tx.account_id):
        mirror = (
            db.query(BankTransaction)
              .filter(
                  BankTransaction.account_id == coaid,
                  BankTransaction.counter_account_id == (data.bank_account_id or tx.account_id),
                  BankTransaction.date == data.date,
                  BankTransaction.reference == (data.reference or tx.reference),
              ).first()
        )
        if not mirror:
            mirror = BankTransaction(
                date=data.date, reference=data.reference or tx.reference,
                narration=(data.narration or tx.narration or "Inter-account transfer (out)"),
                account_id=coaid, counter_account_id=(data.bank_account_id or tx.account_id),
            )
            if hasattr(BankTransaction, "type"):
                mirror.type = "withdrawal"; mirror.amount = data.amount or tx.amount
            else:
                mirror.amount = -abs(data.amount or tx.amount)
            db.add(mirror)

    tx.date = data.date
    tx.reference = data.reference
    tx.narration = data.narration
    tx.amount = data.amount
    tx.account_id = data.bank_account_id or tx.account_id
    tx.counter_account_id = coaid
    db.commit()
    return {"message": "Receipt updated."}

@router.post("/batch_delete")
def batch_delete_receipts(payload: BatchDeleteIn, db: Session = Depends(get_db)):
    deleted = db.query(BankTransaction).filter(BankTransaction.id.in_(payload.ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}

# ---------- CSV export/import (legacy PaymentReceipt) ----------
@router.get("/export/")
def export_receipts_csv(db: Session = Depends(get_db)):
    receipts = db.query(PaymentReceipt).all()
    out = io.StringIO(); w = csv.writer(out)
    w.writerow(["Date", "Invoice ID", "Customer", "Amount", "Reference", "Narration"])
    for r in receipts:
        inv = db.query(Invoice).filter(Invoice.id == r.invoice_id).first()
        cust = db.query(Customer).filter(Customer.id == inv.customer_id).first() if inv else None
        w.writerow([r.date, r.invoice_id, cust.name if cust else "", r.amount, r.reference, r.narration])
    out.seek(0)
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=receipts.csv"})

@router.post("/import/")
async def import_receipts(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    imported, errors = 0, []
    for row in reader:
        try:
            inv = db.query(Invoice).filter(Invoice.invoice_number == row["invoice_id"]).first()
            if not inv:
                errors.append(f"Invoice {row['invoice_id']} not found.")
                continue
            db.add(PaymentReceipt(
                invoice_id=inv.id,
                amount=float(row["amount"]),
                date=row["date"],
                reference=row.get("reference"),
                narration=row.get("narration"),
                bank_account_id=int(row["bank_account_id"])
            ))
            imported += 1
        except Exception as e:
            errors.append(str(e))
    db.commit()
    return {"imported": imported, "errors": errors}


