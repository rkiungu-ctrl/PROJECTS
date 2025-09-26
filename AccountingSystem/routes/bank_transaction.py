# routes/bank_transaction.py
from fastapi import APIRouter, Depends, HTTPException, Query, Body, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, String
from typing import Optional, Tuple, List, Dict
import csv, io
import pandas as pd
import datetime as dt

import models
from models import Account, BankTransaction, JournalLine
from database import get_db
from schemas.bank_transaction import BankTransactionCreate, BankTransactionOut, TransactionLine
from pydantic import BaseModel

router = APIRouter(prefix="/bank_transactions", tags=["Bank Transactions"])

# ------------- helpers -------------

def _parse_date(s: str) -> Optional[dt.date]:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d %b %Y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except Exception:
            pass
    try:
        return dt.date.fromisoformat(s)
    except Exception:
        return None

def _counter_for_tx(db: Session, tx: BankTransaction) -> Tuple[Optional[int], Optional[str], Optional[str]]:
    """
    Return (id, name, code) of the counter account from the tx's journal entry.
    """
    if not getattr(tx, "journal_entry_id", None):
        return None, None, None
    lines: List[models.JournalLine] = db.query(models.JournalLine).filter(
        models.JournalLine.journal_entry_id == tx.journal_entry_id
    ).all()
    other = next((ln for ln in lines if ln.account_id != tx.account_id), None)
    if not other:
        return None, None, None
    acc = db.query(Account).filter(Account.id == other.account_id).first()
    return (acc.id if acc else None), (acc.name if acc else None), (acc.account_code if acc else None)

def _find_suspense(db: Session, fallback: Account) -> Account:
    sus = (
        db.query(Account)
        .filter(
            (Account.name.ilike("%suspense%")) |
            (Account.account_code.ilike("%SUSP%"))
        )
        .first()
    )
    return sus or fallback

# ------------- create (by account_id) -------------

@router.post("/", response_model=BankTransactionOut)
def create_bank_transaction(tx: BankTransactionCreate, db: Session = Depends(get_db)):
    # Create main transaction
    transaction = BankTransaction(
        account_id=tx.account_id,
        date=tx.date,
        type=tx.type,
        amount=tx.amount,
        reference=tx.reference,
        narration=tx.narration,
        counter_account_id=tx.counter_account_id,
        cash_flow_type=tx.cash_flow_type,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    # Handle split lines
    if tx.lines:
        for line in tx.lines:
            journal_line = JournalLine(
                transaction_id=transaction.id,
                account_id=line.account_id,
                amount=line.amount,
                narration=line.narration,
            )
            db.add(journal_line)
        db.commit()

    return transaction

# ------------- export -------------

@router.get("/export/")
def export_bank_transactions(
    account_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    from_date: Optional[dt.date] = Query(None),
    to_date: Optional[dt.date] = Query(None),
    reconciled: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(models.BankTransaction)
    if account_id:
        query = query.filter(models.BankTransaction.account_id == account_id)
    if type:
        query = query.filter(models.BankTransaction.type.ilike(type))
    if from_date and to_date:
        query = query.filter(models.BankTransaction.date >= from_date, models.BankTransaction.date <= to_date)
    if reconciled is not None:
        query = query.filter(models.BankTransaction.is_reconciled == reconciled)

    results = query.all()
    data: List[Dict] = []
    for tx in results:
        account_name = tx.account.name if tx.account else "Unknown"
        data.append({
            "Date": tx.date, "Account": account_name, "Type": tx.type, "Amount": tx.amount,
            "Reference": tx.reference, "Narration": tx.narration, "Cash Flow Type": tx.cash_flow_type,
            "Reconciled": tx.is_reconciled,
        })

    file_path = "bank_transactions_export.xlsx"
    pd.DataFrame(data).to_excel(file_path, index=False)
    return FileResponse(file_path, filename="bank_transactions_export.xlsx")

# ------------- transfer -------------

@router.post("/transfer/")
def transfer_funds(
    from_account_id: int = Body(...),
    to_account_id: int = Body(...),
    amount: float = Body(...),
    date: Optional[dt.date] = Body(None),
    reference: Optional[str] = Body(None),
    narration: Optional[str] = Body("Account Transfer"),
    db: Session = Depends(get_db),
):
    tx_date = date or dt.date.today()
    if from_account_id == to_account_id:
        raise HTTPException(status_code=400, detail="Cannot transfer to the same account")

    from_account = db.query(models.Account).filter_by(id=from_account_id).first()
    to_account = db.query(models.Account).filter_by(id=to_account_id).first()
    if not from_account or not to_account:
        raise HTTPException(status_code=404, detail="One or both accounts not found")

    journal = models.JournalEntry(date=tx_date, reference=reference or f"TRF-{from_account_id}-{to_account_id}", narration=narration)
    db.add(journal); db.commit(); db.refresh(journal)

    lines = [
        models.JournalLine(journal_entry_id=journal.id, account_id=to_account.id, account_code=to_account.account_code, narration="Transfer In",  debit=amount, credit=0.0),
        models.JournalLine(journal_entry_id=journal.id, account_id=from_account.id, account_code=from_account.account_code, narration="Transfer Out", debit=0.0, credit=amount),
    ]
    db.add_all(lines); db.commit()
    return {"message": "Transfer posted successfully", "journal_id": journal.id}

# ------------- reconcile & summary -------------

@router.patch("/{transaction_id}/reconcile")
def reconcile_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(models.BankTransaction).filter_by(id=transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tx.is_reconciled = True
    db.commit()
    return {"message": "Transaction marked as reconciled"}

@router.get("/summary")
def get_cash_balance(db: Session = Depends(get_db)):
    deposits = db.query(func.sum(models.BankTransaction.amount)).filter(models.BankTransaction.type.ilike("deposit")).scalar() or 0
    withdrawals = db.query(func.sum(models.BankTransaction.amount)).filter(models.BankTransaction.type.ilike("withdrawal")).scalar() or 0
    return {"cash_balance": deposits - withdrawals}

# ------------- import (creates journal + links) -------------

@router.post("/import/")
async def import_bank_statement(
    file: UploadFile = File(...),
    account_code: str = Form(...),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    decoded = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))

    bank = db.query(Account).filter(Account.account_code == account_code).first()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank account not found")

    suspense = _find_suspense(db, bank)

    imported = duplicates = failed = 0
    errors = []
    last_idx = 0

    for idx, row in enumerate(reader, start=1):
        last_idx = idx
        try:
            tx_date = _parse_date(row.get("Date"))
            ref = (row.get("Reference") or "").strip()
            narr = (row.get("Narration") or row.get("Description") or "").strip()

            # duplicate check on (bank, date, reference)
            exists = db.query(BankTransaction).filter(
                BankTransaction.account_id == bank.id,
                BankTransaction.reference == ref,
                BankTransaction.date == tx_date,
            ).first()
            if exists:
                duplicates += 1
                errors.append(f"Row {idx}: Duplicate reference/date")
                continue

            # amount / type
            amt_raw = (row.get("Amount") or row.get("Credit") or row.get("Debit") or "0").replace(",", "")
            val = float(amt_raw)
            tx_type = "deposit" if val >= 0 else "withdrawal"
            amt = abs(val)

            # journal
            journal = models.JournalEntry(
                date=tx_date or dt.date.today(),
                reference=ref or f"IMP-{idx}",
                narration=narr or f"Imported {tx_type}",
            )
            db.add(journal); db.commit(); db.refresh(journal)

            # counter line (fallback to Suspense)
            counter = suspense

            if tx_type == "deposit":
                db.add_all([
                    models.JournalLine(journal_entry_id=journal.id, account_id=bank.id,    account_code=bank.account_code,    narration="Bank Deposit",    debit=amt, credit=0.0),
                    models.JournalLine(journal_entry_id=journal.id, account_id=counter.id, account_code=counter.account_code, narration="Counter (Import)", debit=0.0, credit=amt),
                ])
            else:
                db.add_all([
                    models.JournalLine(journal_entry_id=journal.id, account_id=counter.id, account_code=counter.account_code, narration="Counter (Import)", debit=amt, credit=0.0),
                    models.JournalLine(journal_entry_id=journal.id, account_id=bank.id,    account_code=bank.account_code,    narration="Bank Withdrawal", debit=0.0, credit=amt),
                ])

            # bank tx linked to journal
            txn = BankTransaction(
                account_id=bank.id,
                date=tx_date or dt.date.today(),
                type=tx_type,
                amount=amt,
                reference=ref or None,
                narration=narr or None,
                journal_entry_id=journal.id,
            )
            db.add(txn)
            imported += 1
        except Exception as ex:
            failed += 1
            errors.append(f"Row {idx}: {str(ex)}")

    db.commit()
    return {"total": last_idx, "imported": imported, "duplicates": duplicates, "failed": failed, "errors": errors}

# ------------- odd summary path kept for compatibility -------------

@router.get("/bank_transactions/summary")
def bank_summary(db: Session = Depends(get_db)):
    accounts = db.query(Account).filter(Account.type == "Asset", Account.category.in_(["Bank", "Cash"])).all()
    result = []
    for acc in accounts:
        deposits = db.query(BankTransaction.amount).with_entities(func.sum(BankTransaction.amount)).filter(
            BankTransaction.account_id == acc.id, BankTransaction.type == "deposit"
        ).scalar() or 0
        withdrawals = db.query(BankTransaction.amount).with_entities(func.sum(BankTransaction.amount)).filter(
            BankTransaction.account_id == acc.id, BankTransaction.type == "withdrawal"
        ).scalar() or 0
        result.append({
            "account_id": acc.id, "account_code": acc.account_code, "account_name": acc.name,
            "type": acc.category, "balance": deposits - withdrawals
        })
    return result

# ------------- list endpoints (include counter account) -------------

@router.get("/account/{account_id}")
def list_transactions(
    account_id: int,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    q: str = Query("", alias="q"),
):
    query = db.query(BankTransaction).filter(BankTransaction.account_id == account_id)
    if q:
        search = f"%{q}%"
        query = query.filter(
            (BankTransaction.narration.ilike(search)) |
            (BankTransaction.reference.ilike(search)) |
            (BankTransaction.date.cast(String).ilike(search))
        )
    total = query.count()
    rows = (query.order_by(BankTransaction.date.desc(), BankTransaction.id.desc())
                 .offset((page - 1) * page_size).limit(page_size).all())
    txs = []
    for tx in rows:
        cid, c_name, c_code = _counter_for_tx(db, tx)
        txs.append({
            "id": tx.id, "date": tx.date, "type": tx.type, "amount": tx.amount,
            "reference": tx.reference, "narration": tx.narration,
            "account_id": tx.account_id,
            "account_name": tx.account.name if tx.account else "",
            "account_code": tx.account.account_code if tx.account else "",
            "counter_account_id": cid, "counter_account_name": c_name, "counter_account_code": c_code,
        })
    return {"total": total, "page": page, "page_size": page_size, "transactions": txs}

@router.get("/code/{account_code}")
def list_transactions_by_code(
    account_code: str,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    q: str = Query("", alias="q"),
):
    # ✅ Filter to this account_code
    query = (
        db.query(BankTransaction)
        .join(Account, BankTransaction.account_id == Account.id)
        .filter(Account.account_code == account_code)
    )

    if q:
        search = f"%{q}%"
        query = query.filter(
            (BankTransaction.narration.ilike(search)) |
            (BankTransaction.reference.ilike(search)) |
            (BankTransaction.date.cast(String).ilike(search))
        )

    total = query.count()
    rows = (
        query.order_by(BankTransaction.date.desc(), BankTransaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    txs = []
    for tx in rows:
        cid, c_name, c_code = _counter_for_tx(db, tx)
        txs.append({
            "id": tx.id, "date": tx.date, "type": tx.type, "amount": tx.amount,
            "reference": tx.reference, "narration": tx.narration,
            "account_id": tx.account_id,
            "account_name": tx.account.name if tx.account else "",
            "account_code": tx.account.account_code if tx.account else "",
            "counter_account_id": cid, "counter_account_name": c_name, "counter_account_code": c_code,
            "running_balance": getattr(tx, "running_balance", None),
        })
    return {"total": total, "page": page, "page_size": page_size, "transactions": txs}


# ------------- create by account_code / update / delete -------------

class BankTransactionCreateByCode(BaseModel):
    account_code: str
    date: str
    type: str
    amount: float
    reference: Optional[str] = None
    narration: Optional[str] = None
    # Optional: allow picking counter on create-by-code too
    counter_account_id: Optional[int] = None

@router.post("/code/", response_model=BankTransactionOut)
def create_transaction_by_code(tx: BankTransactionCreateByCode, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.account_code == tx.account_code).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    tx_date = dt.datetime.strptime(tx.date, "%Y-%m-%d").date()

    # resolve optional counter
    counter_account = None
    if tx.counter_account_id:
        counter_account = db.query(Account).filter(Account.id == tx.counter_account_id).first()
        if not counter_account:
            raise HTTPException(status_code=404, detail="Counter account not found")

    # Create bank tx (journal created in normal create; here we mirror simpler path)
    new_tx = BankTransaction(
        account_id=account.id, date=tx_date, type=tx.type.lower(), amount=tx.amount,
        reference=tx.reference, narration=tx.narration,
    )
    db.add(new_tx); db.commit(); db.refresh(new_tx)

    # Create journal for parity with main create
    journal = models.JournalEntry(
        date=new_tx.date,
        reference=new_tx.reference or f"TX-{new_tx.id}",
        narration=new_tx.narration or f"{new_tx.type} for {account.name}",
    )
    db.add(journal); db.commit(); db.refresh(journal)

    if not counter_account:
        if new_tx.type == "deposit":
            counter_account = db.query(Account).filter(Account.type == "Income").order_by(Account.id.asc()).first()
        else:
            counter_account = db.query(Account).filter(Account.type == "Expense").order_by(Account.id.asc()).first()
        if not counter_account:
            counter_account = _find_suspense(db, account)

    if new_tx.type == "deposit":
        db.add_all([
            JournalLine(journal_entry_id=journal.id, account_id=account.id,        account_code=account.account_code,        narration="Bank Deposit",    debit=new_tx.amount, credit=0.0),
            JournalLine(journal_entry_id=journal.id, account_id=counter_account.id, account_code=counter_account.account_code, narration="Counter",         debit=0.0,           credit=new_tx.amount),
        ])
    else:
        db.add_all([
            JournalLine(journal_entry_id=journal.id, account_id=counter_account.id, account_code=counter_account.account_code, narration="Counter",         debit=new_tx.amount, credit=0.0),
            JournalLine(journal_entry_id=journal.id, account_id=account.id,        account_code=account.account_code,        narration="Bank Withdrawal", debit=0.0,            credit=new_tx.amount),
        ])

    new_tx.journal_entry_id = journal.id
    db.commit(); db.refresh(new_tx)
    return new_tx

@router.put("/{id}", response_model=BankTransactionOut)
def update_transaction(id: int, tx: dict = Body(...), db: Session = Depends(get_db)):
    transaction = db.query(BankTransaction).filter(BankTransaction.id == id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # --- normalize / basic fields ---
    date_val = tx.get("date", transaction.date)
    if isinstance(date_val, str):
        date_val = dt.datetime.strptime(date_val, "%Y-%m-%d").date()
    transaction.date = date_val

    if "type" in tx and tx["type"]:
        transaction.type = tx["type"].lower().strip()
    transaction.amount = float(tx.get("amount", transaction.amount))
    transaction.reference = tx.get("reference", transaction.reference)
    transaction.narration = tx.get("narration", transaction.narration)

    # --- current bank (Asset: Bank/Cash) ---
    original_bank_account_id = transaction.account_id
    current_bank = db.query(Account).filter(Account.id == original_bank_account_id).first()

    # Optional: allow moving to a different bank
    if "bank_account_id" in tx and tx["bank_account_id"]:
        new_bank = db.query(Account).filter(Account.id == int(tx["bank_account_id"])).first()
        if not new_bank:
            raise HTTPException(status_code=404, detail="Bank account not found")
        transaction.account_id = new_bank.id
        current_bank = new_bank

    # --- resolve the intended COUNTER account ---
    desired_counter_id = tx.get("counter_account_id") or tx.get("expense_account_id")
    # If only "account_id" was passed but it's NOT a bank/cash, treat it as the counter
    if desired_counter_id is None and "account_id" in tx:
        maybe_counter = db.query(Account).filter(Account.id == int(tx["account_id"])).first()
        if maybe_counter:
            is_bankish = (maybe_counter.type == "Asset" and maybe_counter.category in ("Bank", "Cash"))
            if (not is_bankish) or (maybe_counter.id != current_bank.id):
                desired_counter_id = maybe_counter.id

    # Fallback to Suspense if none given
    if desired_counter_id is None:
        desired_counter = _find_suspense(db, current_bank)
    else:
        desired_counter = db.query(Account).filter(Account.id == int(desired_counter_id)).first()
        if not desired_counter:
            raise HTTPException(status_code=404, detail="Counter account not found")

    # --- ensure a journal exists, then enforce the 2-line pattern ---
    if not transaction.journal_entry_id:
        journal = models.JournalEntry(
            date=transaction.date,
            reference=transaction.reference or f"TX-{transaction.id}",
            narration=transaction.narration or f"{transaction.type} for {current_bank.name}",
        )
        db.add(journal); db.commit(); db.refresh(journal)
        transaction.journal_entry_id = journal.id
    else:
        journal = db.query(models.JournalEntry).filter(models.JournalEntry.id == transaction.journal_entry_id).first()

    # keep journal header in sync
    if journal:
        journal.date = transaction.date
        journal.reference = transaction.reference or journal.reference
        journal.narration = transaction.narration or journal.narration

    # remove whatever is there and rebuild cleanly (prevents edge cases)
    lines = db.query(JournalLine).filter(JournalLine.journal_entry_id == journal.id).all()
    for ln in lines:
        db.delete(ln)
    db.flush()

    amt = float(transaction.amount or 0.0)
    if transaction.type == "deposit":
        # Dr Bank, Cr Counter
        db.add_all([
            JournalLine(journal_entry_id=journal.id, account_id=current_bank.id,    account_code=current_bank.account_code,    narration="Bank Deposit",    debit=amt, credit=0.0),
            JournalLine(journal_entry_id=journal.id, account_id=desired_counter.id, account_code=desired_counter.account_code, narration=desired_counter.name, debit=0.0, credit=amt),
        ])
    else:
        # withdrawal: Dr Counter, Cr Bank
        db.add_all([
            JournalLine(journal_entry_id=journal.id, account_id=desired_counter.id, account_code=desired_counter.account_code, narration=desired_counter.name, debit=amt, credit=0.0),
            JournalLine(journal_entry_id=journal.id, account_id=current_bank.id,    account_code=current_bank.account_code,    narration="Bank Withdrawal",  debit=0.0, credit=amt),
        ])

    # Persist counter id on the transaction *if your model has this column*.
    # If your BankTransaction model lacks it, this line is harmless (it just won't persist after refresh).
    try:
        transaction.counter_account_id = int(desired_counter.id)
    except Exception:
        pass

    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(BankTransaction).filter_by(id=transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx); db.commit()
    return {"message": "Transaction deleted"}

# ------------- (Optional) party suggestions for a counter account -------------

@router.get("/parties")
def suggest_parties(counter_account_id: int = Query(...), db: Session = Depends(get_db)):
    """
    Future-use: If counter account is Trade Payables -> suppliers, if Receivables -> customers.
    Adjust classification rules to your COA structure if needed.
    """
    acc = db.query(Account).filter(Account.id == counter_account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    name_l = (acc.name or "").lower()
    cat_l = (acc.category or "").lower()
    typ_l = (acc.type or "").lower()

    is_payables = ("payable" in name_l) or (cat_l == "payables")
    is_receivables = ("receivable" in name_l) or (cat_l == "receivables")

    # You can wire real models later; return empty list for now if you don't have Supplier/Customer tables
    parties: List[Dict] = []
    # Example (uncomment when you have models):
    # if is_payables:
    #     parties = [{"id": s.id, "name": s.name} for s in db.query(models.Supplier).order_by(models.Supplier.name.asc()).all()]
    # elif is_receivables:
    #     parties = [{"id": c.id, "name": c.name} for c in db.query(models.Customer).order_by(models.Customer.name.asc()).all()]

    return {"type": "suppliers" if is_payables else ("customers" if is_receivables else "none"),
            "parties": parties}

@router.get("/import/template/")
def download_import_template():
    """
    Download a CSV template for bank statement import.
    """
    template_path = "bank_statement_template.csv"
    with open(template_path, "w", encoding="utf-8") as f:
        f.write("Date,Reference,Narration,Amount\n")
        f.write("2024-01-01,REF001,Deposit Example,1000.00\n")
        f.write("2024-01-02,REF002,Withdrawal Example,-500.00\n")
    return FileResponse(template_path, filename="bank_statement_template.csv")

@router.delete("/accounts/batch_delete/")
def batch_delete_accounts(account_ids: list[int] = Body(...), db: Session = Depends(get_db)):
    deleted = 0
    for acc_id in account_ids:
        account = db.query(models.Account).filter_by(id=acc_id).first()
        if account:
            db.delete(account)
            deleted += 1
    db.commit()
    return {"deleted": deleted}

@router.post("/transactions/batch_move/")
def batch_move_transactions(
    transaction_ids: list[int] = Body(...),
    target_account_id: int = Body(...),
    db: Session = Depends(get_db)
):
    moved = 0
    for tx_id in transaction_ids:
        tx = db.query(models.BankTransaction).filter_by(id=tx_id).first()
        if tx:
            tx.account_id = target_account_id
            moved += 1
    db.commit()
    return {"moved": moved}
