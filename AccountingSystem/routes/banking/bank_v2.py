from models.supplier import Supplier
from models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceLine
from models import Tax
from decimal import Decimal
from sqlalchemy.orm import Session
from typing import Optional


# --- ETR Purchase Helpers ---

def get_or_create_supplier_from_etr(db: Session, name: Optional[str], pin: Optional[str]):
    """
    Find or create a Supplier based on ETR supplier name and PIN.
    - If a supplier with the same name (and optionally PIN) exists, reuse it.
    - If PIN column exists and supplier has no PIN yet, update it.
    """
    name = (name or "").strip()
    pin = (pin or "").strip()

    if not name:
        return None

    query = db.query(Supplier).filter(Supplier.name == name)

    # If Supplier has a kra_pin column, try to filter on it too
    if pin and hasattr(Supplier, "kra_pin"):
        query = query.filter(Supplier.kra_pin == pin)

    supplier = query.first()

    if supplier:
        # If we have a PIN on the ETR but supplier has empty PIN, update it
        if (
            pin
            and hasattr(supplier, "kra_pin")
            and not (getattr(supplier, "kra_pin") or "").strip()
        ):
            supplier.kra_pin = pin
            db.add(supplier)
        return supplier

    # Create a new supplier
    supplier_kwargs = {"name": name}
    if hasattr(Supplier, "kra_pin"):
        supplier_kwargs["kra_pin"] = pin or None

    supplier = Supplier(**supplier_kwargs)
    db.add(supplier)
    db.flush()
    return supplier


def create_or_update_etr_purchase_for_transaction(db: Session, tx, payload):
    """
    Ensure an ETR Purchase (with VAT) bank payment has a matching PurchaseInvoice.

    Behaviour:
    - Only runs when payment_type == 'etr_purchase'.
    - Uses ETR Supplier + PIN to find/create Supplier.
    - Uses bank payment reference as Purchase Invoice reference.
    - Stores ETR Number as CU Invoice Number.
    - Creates one SERVICE line per payment line with VAT calculated per line.
    - Marks invoice as paid since it's created from bank payment.
    """
    if not payload or getattr(payload, "payment_type", None) != "etr_purchase":
        return

    lines_data = getattr(payload, "lines", []) or []
    if not lines_data:
        return

    # 1) Calculate totals per line with VAT
    subtotal = Decimal("0")
    vat_total = Decimal("0")
    gross_total = Decimal("0")

    def _normalize_vat_code(raw_code: Optional[str]) -> Optional[str]:
        """Return a VAT code value compatible with purchase computations.
        Purchase routes expect `PurchaseInvoiceLine.vat_code` to match either
        a Tax `id` or `account_code` when calculating rates. We'll prefer
        storing `account_code` for clarity.

        Accepts common inputs like "VAT 16%", "VAT16", names, or ids and
        resolves them to a known Tax.account_code where possible.
        """
        if not raw_code:
            return None
        code = str(raw_code).strip()
        TaxModel = Tax
        # Try direct id match
        try:
            tax_id = int(code)
            tax = db.query(TaxModel).filter(TaxModel.id == tax_id).first()
            if tax and getattr(tax, "account_code", None):
                return str(tax.account_code)
        except Exception:
            pass

        # Try account_code exact match
        tax = db.query(TaxModel).filter(getattr(TaxModel, "account_code") == code).first() if hasattr(TaxModel, "account_code") else None
        if tax and getattr(tax, "account_code", None):
            return str(tax.account_code)

        # Try by code/name attributes
        if hasattr(TaxModel, "code"):
            tax = db.query(TaxModel).filter(TaxModel.code == code).first()
            if tax and getattr(tax, "account_code", None):
                return str(tax.account_code)
        if hasattr(TaxModel, "name"):
            tax = db.query(TaxModel).filter(TaxModel.name == code).first()
            if tax and getattr(tax, "account_code", None):
                return str(tax.account_code)

        # Normalize common strings
        norm = code.upper().replace(" ", "").replace("%", "")
        common = {"VAT16": 0.16, "VAT_16": 0.16}
        if norm in common:
            # Find a VAT tax entry at ~16%
            candidates = db.query(TaxModel).all()
            for t in candidates:
                ttype = str(getattr(t, "type", "") or "").upper()
                rate = float(getattr(t, "rate", 0) or 0)
                if "VAT" in ttype and abs(rate - 0.16) < 1e-6 and getattr(t, "account_code", None):
                    return str(t.account_code)

        # As a last resort, store the raw code
        return code

    line_calculations = []
    for line in lines_data:
        gross = Decimal(str(line.amount or 0))
        gross_total += gross

        if line.vat_code:
            tax = None
            if hasattr(Tax, "code"):
                tax = db.query(Tax).filter(Tax.code == line.vat_code).first()
            elif hasattr(Tax, "name"):
                tax = db.query(Tax).filter(Tax.name == line.vat_code).first()
            if tax and getattr(tax, "rate", None) is not None:
                vat_rate = Decimal(str(tax.rate))
                if vat_rate != 0:
                    net = (gross / (Decimal("1") + vat_rate)).quantize(Decimal("0.01"))
                    vat = gross - net
                else:
                    net = gross
                    vat = Decimal("0")
            else:
                # Fallback mapping for common VAT codes
                code_norm = str(line.vat_code).upper().replace(" ", "").replace("%", "")
                if code_norm in ("VAT16", "VAT_16"):
                    vat_rate = Decimal("0.16")
                    net = (gross / (Decimal("1") + vat_rate)).quantize(Decimal("0.01"))
                    vat = gross - net
                else:
                    net = gross
                    vat = Decimal("0")
        else:
            net = gross
            vat = Decimal("0")

        subtotal += net
        vat_total += vat

        line_calculations.append({
            "account_code": line.account_code,
            "description": getattr(line, "description", None),
            "net": net,
            "vat": vat,
            "gross": gross,
            "vat_code": _normalize_vat_code(getattr(line, "vat_code", None)),
        })

    # 2) Get or create Supplier from ETR details
    supplier = get_or_create_supplier_from_etr(
        db,
        getattr(payload, "etr_supplier_name", None),
        getattr(payload, "etr_supplier_pin", None),
    )

    # 3) Create or update PurchaseInvoice header
    etr_number = getattr(payload, "etr_number", None)
    etr_date = getattr(payload, "etr_date", None) or getattr(payload, "date", None)
    reference = getattr(payload, "reference", None) or getattr(tx, "reference", None)
    currency = getattr(payload, "currency", None) or getattr(tx, "currency", None)

    if tx.purchase_invoice_id:
        invoice = (
            db.query(PurchaseInvoice)
            .filter(PurchaseInvoice.id == tx.purchase_invoice_id)
            .first()
        )
    else:
        invoice = None

    if invoice is None:
        invoice = PurchaseInvoice(
            supplier_id=supplier.id if supplier else None,
        )
        db.add(invoice)
        db.flush()
        tx.purchase_invoice_id = invoice.id

    # Update header fields generically (using hasattr so we don't break your model)
    if hasattr(invoice, "supplier_id") and supplier:
        invoice.supplier_id = supplier.id

    if hasattr(invoice, "invoice_date"):
        invoice.invoice_date = etr_date

    # Use bank payment reference as invoice reference (column "Reference" on list)
    if hasattr(invoice, "reference"):
        invoice.reference = reference

    # Store ETR number as CU Invoice Number so it shows correctly on list + PDF
    if hasattr(invoice, "cu_inv_number"):
        invoice.cu_inv_number = etr_number

    # Currency fields vary by model name – handle both styles
    if hasattr(invoice, "currency_code"):
        invoice.currency_code = currency
    elif hasattr(invoice, "currency"):
        invoice.currency = currency

    # Header totals
    if hasattr(invoice, "sub_total"):
        invoice.sub_total = float(subtotal)

    if hasattr(invoice, "vat_amount"):
        invoice.vat_amount = float(vat_total)
    elif hasattr(invoice, "vat"):
        invoice.vat = float(vat_total)

    if hasattr(invoice, "excise_amount"):
        invoice.excise_amount = 0.0
    elif hasattr(invoice, "excise"):
        invoice.excise = 0.0

    if hasattr(invoice, "total_amount"):
        invoice.total_amount = float(gross_total)
    elif hasattr(invoice, "total"):
        invoice.total = float(gross_total)

    # Mark as paid
    if hasattr(invoice, "balance_due"):
        invoice.balance_due = 0.0
    if hasattr(invoice, "status"):
        invoice.status = "Paid"

    # 4) Clear existing lines for this invoice
    if hasattr(invoice, "lines") and invoice.lines is not None:
        for line in list(invoice.lines):
            db.delete(line)
    else:
        db.query(PurchaseInvoiceLine).filter(
            PurchaseInvoiceLine.purchase_invoice_id == invoice.id
        ).delete()

    # 5) Create SERVICE lines, one per payment line
    for calc in line_calculations:
        line_kwargs = {
            "purchase_invoice_id": invoice.id,
            "account_code": calc["account_code"],
            "description": (
                calc.get("description")
                if calc.get("description") not in (None, "")
                else (getattr(payload, "description", None) or getattr(tx, "description", None))
            ),
            "quantity": 1,
            "unit_price": float(calc["net"]),
            "vat_code": calc["vat_code"],
        }

        # If your model has a 'type' column, treat this as a Service line
        if hasattr(PurchaseInvoiceLine, "type"):
            line_kwargs["type"] = "Service"

        # If there is a product_id column, leave it empty (service purchase)
        if hasattr(PurchaseInvoiceLine, "product_id"):
            line_kwargs["product_id"] = None

        # If there is a line_total or amount column, store gross
        if hasattr(PurchaseInvoiceLine, "total"):
            line_kwargs["total"] = float(calc["gross"])
        elif hasattr(PurchaseInvoiceLine, "amount"):
            line_kwargs["amount"] = float(calc["gross"])

        line = PurchaseInvoiceLine(**line_kwargs)
        db.add(line)

    db.flush()
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Path, UploadFile, File, Form
from typing import List, Optional
from decimal import Decimal

from database import get_db
from sqlalchemy.orm import Session

import models
from models.bank_payment_line import BankPaymentLine as V2PaymentLine
from models.bank_account_profile import BankAccountProfile
from models.account import Account
from models.bank_transaction_v2 import BankTransactionV2
from models.bank_rule import BankRule

from schemas.banking import BankPaymentResponse, BankPaymentLine, BankPaymentUpdate

router = APIRouter(
    prefix="/bank-accounts",
    tags=["Banking v2"],
)

# --- Account Statement Endpoint ---
from pydantic import BaseModel, Field

class BankTransactionStatementOut(BaseModel):
    id: int
    date: date
    reference: Optional[str]
    payee: Optional[str]
    narration: Optional[str]
    amount: Decimal
    transaction_type: str
    counter_account_id: Optional[int]
    description: Optional[str]
    balance: float

    model_config = dict(from_attributes=True)


# Paginated response model for statements
class BankTransactionStatementPage(BaseModel):
    items: list[BankTransactionStatementOut] = Field(default_factory=list)
    total_items: int
    total_amount: float
    closing_balance: float

    model_config = dict(from_attributes=True)

class StatementImportResult(BaseModel):
    total_rows: int
    imported_rows: int
    skipped_rows: int
    errors: list[str] = []

class DuplicateGroupItem(BaseModel):
    id: int
    date: date
    reference: Optional[str]
    narration: Optional[str]
    amount: float

    model_config = dict(from_attributes=True)

class DuplicateGroup(BaseModel):
    key: str
    count: int
    items: list[DuplicateGroupItem] = Field(default_factory=list)

class DuplicateScanResult(BaseModel):
    account_id: int
    start_date: date
    end_date: date
    total_transactions: int
    duplicate_groups: list[DuplicateGroup] = Field(default_factory=list)

class ApplyRulesResult(BaseModel):
    bank_account_id: int
    checked: int
    categorized: int
    payments_created: int
    receipts_created: int
    updated: int

def apply_bank_rules_to_transaction(db: Session, tx: BankTransactionV2) -> dict:
    """
    Apply the first matching active BankRule to this transaction.
    - Sets counter_account_id to rule.target_account_id
    - Sets payee fields from rule
    - If auto_create_payment_receipt is True, ensure a single line exists mapping amount to target account
    - Marks transaction as categorized
    Returns a dict of changes.
    """
    rules = (
        db.query(BankRule)
        .filter(BankRule.is_active == True)
        .order_by(BankRule.priority.asc(), BankRule.id.asc())
        .all()
    )
    for rule in rules:
        if rule.matches_transaction(tx):
            changes = rule.apply_to_transaction(tx) or {}

            # Apply Phase 2 payee fields
            if getattr(rule, "payee_type", None):
                if getattr(tx, "payee_type", None) != rule.payee_type:
                    tx.payee_type = rule.payee_type
                    changes["payee_type"] = rule.payee_type
                if getattr(rule, "payee_id", None) is not None and getattr(tx, "payee_id", None) != rule.payee_id:
                    tx.payee_id = rule.payee_id
                    changes["payee_id"] = rule.payee_id
            # Fallback payee_name for 'other'
            if getattr(rule, "payee_name", None):
                current_name = getattr(tx, "payee_name", None)
                if not current_name:
                    tx.payee_name = rule.payee_name
                    changes["payee_name"] = rule.payee_name

            # Set counter account from rule explicitly
            if getattr(tx, "counter_account_id", None) != rule.target_account_id:
                tx.counter_account_id = rule.target_account_id
                changes["counter_account_id"] = rule.target_account_id

            # Mark categorized
            if hasattr(tx, "is_categorized") and not getattr(tx, "is_categorized", False):
                tx.is_categorized = True
                changes["is_categorized"] = True

            # Auto-create/update a single line to target account for amount
            payments_created = receipts_created = 0
            if getattr(rule, "auto_create_payment_receipt", True):
                # Ensure lines relationship exists; create or update one line mapping amount to target account
                # Use BankPaymentLine model
                from models.bank_payment_line import BankPaymentLine as Line
                existing_line = None
                if hasattr(tx, "lines") and tx.lines:
                    # choose the first line
                    existing_line = tx.lines[0]
                if existing_line is None:
                    # Create line
                    new_line = Line(
                        payment=tx,
                        account_id=rule.target_account_id,
                        account_code=None,
                        amount=float(getattr(tx, "amount", 0) or 0),
                    )
                    db.add(new_line)
                    changes["line_created"] = True
                    if (getattr(tx, "transaction_type", "") or "").lower() in ("withdrawal", "debit", "out", "payment"):
                        payments_created = 1
                    else:
                        receipts_created = 1
                else:
                    # Update line
                    updated_line = False
                    if getattr(existing_line, "account_id", None) != rule.target_account_id:
                        existing_line.account_id = rule.target_account_id
                        updated_line = True
                    # keep amount in sync
                    line_amt = float(getattr(tx, "amount", 0) or 0)
                    if float(getattr(existing_line, "amount", 0) or 0) != line_amt:
                        existing_line.amount = line_amt
                        updated_line = True
                    if updated_line:
                        changes["line_updated"] = True

            if changes:
                db.add(tx)
            # Return changes plus counters for created type
            changes["payments_created"] = payments_created
            changes["receipts_created"] = receipts_created
            return changes or {}
    return {}

def apply_bank_rules_for_account(
    db: Session,
    bank_account_profile_id: int,
    only_uncategorised: bool = True,
) -> dict:
    """
    Run rules over all transactions for the given bank account (BankAccountProfile.id).
    If only_uncategorised=True, only transactions where counter_account_id IS NULL are touched.
    """
    BT = BankTransactionV2
    q = db.query(BT).filter(BT.account_id == bank_account_profile_id)
    if only_uncategorised:
        q = q.filter(BT.counter_account_id.is_(None))
    txs = q.all()
    total = len(txs)
    updated = 0
    categorized = 0
    payments_created = 0
    receipts_created = 0
    for tx in txs:
        changes = apply_bank_rules_to_transaction(db, tx)
        if changes:
            updated += 1
            if changes.get("is_categorized"):
                categorized += 1
            payments_created += int(changes.get("payments_created", 0) or 0)
            receipts_created += int(changes.get("receipts_created", 0) or 0)
    db.commit()
    return {
        "bank_account_id": bank_account_profile_id,
        "checked": total,
        "categorized": categorized,
        "payments_created": payments_created,
        "receipts_created": receipts_created,
        "updated": updated,
    }

@router.get("/{account_id}/statements", response_model=BankTransactionStatementPage)
def get_account_statement(
    account_id: int = Path(..., description="Bank account ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    base_q = db.query(BankTransactionV2).filter(BankTransactionV2.account_id == account_id)
    total_items = base_q.count()
    q = base_q.order_by(BankTransactionV2.date.desc(), BankTransactionV2.id.desc())
    items = q.offset((page-1)*page_size).limit(page_size).all()
    # Map narration to description for API response
    # Calculate running balances for all transactions, then paginate
    all_txns = base_q.order_by(BankTransactionV2.date.asc(), BankTransactionV2.id.asc()).all()
    running_balances = []
    balance = 0.0
    for txn in all_txns:
        ttype = (getattr(txn, "transaction_type", "") or "").lower()
        amt = float(txn.amount or 0)
        signed_amt = amt if ttype in ("deposit", "credit", "in") else -amt
        balance += signed_amt
        running_balances.append({
            "id": txn.id,
            "date": txn.date,
            "reference": txn.reference,
            "payee": getattr(txn, "payee", None),
            "narration": getattr(txn, "narration", None),
            "amount": signed_amt,
            "transaction_type": txn.transaction_type,
            "counter_account_id": getattr(txn, "counter_account_id", None),
            "description": getattr(txn, "narration", None),
            "balance": balance,
        })

    # Now paginate the running_balances list in ascending order, then reverse for descending display
    total_items = len(running_balances)
    start = max(0, total_items - (page * page_size))
    end = total_items - ((page - 1) * page_size)
    paged_items = running_balances[start:end][::-1] if start < end else []

    # Calculate total_amount for the current page
    total_amount = sum(item["amount"] for item in paged_items)
    closing_balance = balance
    return {
        "items": paged_items,
        "total_items": total_items,
        "total_amount": total_amount,
        "closing_balance": closing_balance,
    }

# --- Payment CREATE endpoint (BankTransactionV2, with ETR support) ---
@router.post("/payments/", response_model=BankPaymentResponse)
def create_bank_payment(payload: BankPaymentUpdate, db: Session = Depends(get_db)):
    # Find bank account
    bank_acc = db.query(models.Account).filter(models.Account.account_code == payload.bank_account_code).first()
    if not bank_acc:
        raise HTTPException(status_code=400, detail="Invalid bank account code")

    # Auto-link ETR fields from supplier if payee_type is supplier and payee_id is set
    etr_supplier_name = payload.etr_supplier_name
    etr_supplier_pin = payload.etr_supplier_pin
    if payload.payee_type == "supplier" and payload.payee_id:
        supplier = db.query(Supplier).filter(Supplier.id == payload.payee_id).first()
        if supplier:
            if not etr_supplier_name:
                etr_supplier_name = supplier.name
            if not etr_supplier_pin:
                etr_supplier_pin = getattr(supplier, "pin", None)

    tx = BankTransactionV2(
        date=payload.date,
        reference=payload.reference,
        account_id=bank_acc.id,
        transaction_type="payment",
        amount=0.0,  # will sum below
        payee_type=payload.payee_type,
        payee_id=payload.payee_id,
        payee_name=payload.payee_name or payload.payee,
        description=payload.description,
        currency=payload.currency or "Ksh",
        payment_type=payload.payment_type or "normal",
        etr_supplier_name=etr_supplier_name,
        etr_supplier_pin=etr_supplier_pin,
        etr_number=payload.etr_number,
        etr_date=payload.etr_date,
        etr_vat_code=payload.etr_vat_code,
    )
    db.add(tx)
    db.flush()

    # Add lines
    total_amount = 0
    lines_out = []
    for line in payload.lines:
        acc = db.query(models.Account).filter(models.Account.account_code == line.account_code).first()
        if not acc:
            continue
        new_line = V2PaymentLine(
            payment_id=tx.id,
            account_id=acc.id,
            account_code=acc.account_code,
            amount=float(line.amount),
        )
        db.add(new_line)
        db.flush()
        lines_out.append(BankPaymentLine(
            id=new_line.id,
            account_id=acc.id,
            account_code=acc.account_code,
            account_name=acc.name,
            amount=line.amount,
        ))
        total_amount += float(line.amount)
    tx.amount = total_amount
    db.commit()
    db.refresh(tx)

    # ETR purchase logic
    if payload.payment_type == "etr_purchase":
        create_or_update_etr_purchase_for_transaction(db, tx, payload)
        db.commit()
        db.refresh(tx)

    return BankPaymentResponse(
        id=tx.id,
        date=tx.date,
        reference=tx.reference,
        bank_account_id=tx.account_id,
        bank_account_name=bank_acc.name,
        bank_account_code=bank_acc.account_code,
        description=tx.description,
        payee=tx.payee_name,
        currency=tx.currency,
        total_amount=tx.amount,
        payment_type=tx.payment_type,
        etr_supplier_name=tx.etr_supplier_name,
        etr_supplier_pin=tx.etr_supplier_pin,
        etr_date=tx.etr_date,
        etr_vat_code=tx.etr_vat_code,
        lines=lines_out,
    )
# Payment schemas for endpoints
from schemas.banking import BankPaymentResponse, BankPaymentLine, BankPaymentUpdate, BankAccountSummary
# ---------- Dashboard summary endpoint ----------

@router.get("/summary", response_model=List[BankAccountSummary])
def get_bank_summary(db: Session = Depends(get_db)):
    """
    Returns one row per bank/cash account for the dashboard summary.
    """
    # Only include physical bank and cash accounts (children of 1141 or 1150, or is_physical=True)
    accounts = db.query(models.Account).filter(
        (models.Account.parent_account_id.in_(
            db.query(models.Account.id).filter(models.Account.account_code.in_(["1141", "1150"]))
        )) | (models.Account.is_physical == True)
    ).all()
    results = []
    for acc in accounts:
        # Find currency code if available
        profile = db.query(models.BankAccountProfile).filter(models.BankAccountProfile.account_id == acc.id).first()
        cur_code = "Ksh"
        if profile and getattr(profile, "currency", None):
            cur = profile.currency
            cur_code = getattr(cur, "code", cur_code) or cur_code

        # Query bank_transactions for this account
        BT = BankTransactionV2
        txns = db.query(BT).filter(BT.account_id == acc.id).all()

        actual_receipts = actual_payments = 0.0
        cleared_receipts = cleared_payments = 0.0
        uncategorized_receipts = uncategorized_payments = 0

        for t in txns:
            amount = float(getattr(t, "amount", 0) or 0)
            t_type = (getattr(t, "transaction_type", "") or "").lower()
            is_cleared = bool(getattr(t, "is_reconciled", False))
            is_categorized = getattr(t, "is_categorized", True)  # fallback True if not present

            if t_type in ("deposit", "credit", "in"):
                actual_receipts += amount
                if is_cleared:
                    cleared_receipts += amount
                if not is_categorized:
                    uncategorized_receipts += 1
            elif t_type in ("withdrawal", "debit", "out"):
                actual_payments += amount
                if is_cleared:
                    cleared_payments += amount
                if not is_categorized:
                    uncategorized_payments += 1

        actual_balance = actual_receipts - actual_payments
        cleared_balance = cleared_receipts - cleared_payments

        results.append(
            BankAccountSummary(
                id=acc.id,
                account_code=acc.account_code,
                name=acc.name,
                currency_code=cur_code,
                uncategorized_receipts=uncategorized_receipts,
                uncategorized_payments=uncategorized_payments,
                cleared_balance=cleared_balance,
                actual_balance=actual_balance,
            )
        )
    return results




# ---------- View / Edit Bank Account (top “View” button) ----------

    # BankAccountDetail endpoint removed (schema no longer exists)
    # If needed, reimplement with a new schema or use BankAccountSummary


    # BankAccountDetail update endpoint removed (schema no longer exists)
    # If needed, reimplement with a new schema or use BankAccountSummary


    # BankAccountDetail create endpoint removed (schema no longer exists)
    # If needed, reimplement with a new schema or use BankAccountSummary


# ---------- Placeholder: statement transactions (for later) ----------


# ---------- Statements (paginated) ----------


    # Removed endpoint for missing BankTransactionResponse schema


# ---------- Soft-delete single account ----------
@router.delete("/{account_id}")
def delete_bank_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    # soft-delete: mark account inactive and its profile inactive if present
    acc.is_active = False
    profile = (
        db.query(BankAccountProfile).filter(BankAccountProfile.account_id == acc.id).first()
    )
    if profile:
        profile.is_active = False

    db.add(acc)
    if profile:
        db.add(profile)
    db.commit()

    return {"status": "ok", "account_id": account_id}


# ---------- Batch delete (soft) ----------
from pydantic import BaseModel


class BatchDeletePayload(BaseModel):
    ids: List[int]


@router.post("/batch-delete")
def batch_delete_accounts(payload: BatchDeletePayload, db: Session = Depends(get_db)):
    ids = payload.ids or []
    if not ids:
        raise HTTPException(status_code=400, detail="No account ids provided")

    accounts = db.query(models.Account).filter(models.Account.id.in_(ids)).all()
    for acc in accounts:
        acc.is_active = False
        profile = (
            db.query(BankAccountProfile).filter(BankAccountProfile.account_id == acc.id).first()
        )
        if profile:
            profile.is_active = False
            db.add(profile)
        db.add(acc)

    db.commit()
    return {"status": "ok", "deleted": [a.id for a in accounts]}


    # Legacy SupplierPayment endpoint removed. Use new BankTransaction-based endpoints instead.

@router.get("/withdrawals/", response_model=List[BankPaymentResponse])
def list_bank_withdrawals(db: Session = Depends(get_db)):
    BT = BankTransactionV2
    withdrawals = (
        db.query(BT)
        .filter((BT.transaction_type.in_(["withdrawal", "debit", "out"])) | (BT.transaction_type == None))
        .order_by(BT.date.desc(), BT.id.desc())
        .all()
    )
    results = []
    for tx in withdrawals:
        bank_account = db.query(models.Account).filter(models.Account.id == tx.account_id).first()
        bank_account_name = bank_account.name if bank_account else "-"
        results.append(
            BankPaymentResponse(
                id=tx.id,
                date=tx.date,
                reference=tx.reference,
                bank_account_id=tx.account_id,
                bank_account_name=bank_account_name,
                description=getattr(tx, "narration", None) or getattr(tx, "description", None),
                payee=getattr(tx, "payee", None),
                currency="Ksh",
                total_amount=tx.amount,
                lines=[],
            )
        )
    return results

from models.bank_transaction_v2 import BankTransactionV2

from decimal import Decimal

@router.get("/payments/{transaction_id}", response_model=BankPaymentResponse)
def get_bank_payment(transaction_id: int, db: Session = Depends(get_db)):
    """
    Load a single payment from bank_transactions only.
    """
    tx = db.query(BankTransactionV2).filter(BankTransactionV2.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Bank payment not found")

    bank_account = db.query(models.Account).filter(models.Account.id == tx.account_id).first()
    bank_acc_name = bank_account.name if bank_account else "-"
    bank_acc_code = bank_account.account_code if bank_account else ""

    lines_out = []
    if hasattr(tx, "lines") and tx.lines:
        for l in tx.lines:
            acc = db.query(models.Account).filter(models.Account.id == l.account_id).first()
            lines_out.append(
                BankPaymentLine(
                    id=l.id,
                    account_id=l.account_id,
                    account_code=l.account_code,
                    account_name=acc.name if acc else "",
                    amount=Decimal(str(l.amount)),
                )
            )
    else:
        lines_out = [
            BankPaymentLine(
                id=tx.id,
                account_id=tx.account_id,
                account_code=bank_acc_code,
                account_name=bank_acc_name,
                amount=Decimal(str(tx.amount)),
            )
        ]

    return BankPaymentResponse(
        id=tx.id,
        date=tx.date,
        reference=getattr(tx, "reference", None),
        bank_account_id=tx.account_id,
        bank_account_name=bank_acc_name,
        bank_account_code=bank_acc_code,
        description=getattr(tx, "narration", None) or getattr(tx, "description", None),
        # Prefer payee_name if it exists, otherwise fall back to payee
        payee=getattr(tx, "payee_name", None) or getattr(tx, "payee", None),
        currency=getattr(tx, "currency", "Ksh"),
        total_amount=Decimal(str(tx.amount)),
        payment_type=getattr(tx, "payment_type", "normal") or "normal",
        etr_supplier_name=getattr(tx, "etr_supplier_name", None),
        etr_supplier_pin=getattr(tx, "etr_supplier_pin", None),
        etr_number=getattr(tx, "etr_number", None),
        etr_date=getattr(tx, "etr_date", None),
        etr_vat_code=getattr(tx, "etr_vat_code", None),
        purchase_invoice_id=getattr(tx, "purchase_invoice_id", None),
        lines=lines_out,
    )


@router.put("/payments/{transaction_id}", response_model=BankPaymentResponse)
def update_bank_payment(
    transaction_id: int,
    payload: BankPaymentUpdate,
    db: Session = Depends(get_db),
):
    BT = BankTransactionV2
    tx = db.query(BT).filter(BT.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Bank payment not found")

    # Do NOT change tx.account_id (Paid from stays the same)
    tx.date = payload.date
    tx.reference = payload.reference


    # Set all payee and ETR fields
    # Auto-link ETR fields from supplier if payee_type is supplier and payee_id is set
    etr_supplier_name = payload.etr_supplier_name
    etr_supplier_pin = payload.etr_supplier_pin
    if payload.payee_type == "supplier" and payload.payee_id:
        supplier = db.query(Supplier).filter(Supplier.id == payload.payee_id).first()
        if supplier:
            if not etr_supplier_name:
                etr_supplier_name = supplier.name
            if not etr_supplier_pin:
                etr_supplier_pin = getattr(supplier, "pin", None)

    tx.payee_type = payload.payee_type
    tx.payee_id = payload.payee_id
    tx.payee_name = payload.payee_name or payload.payee
    tx.payment_type = payload.payment_type or "normal"
    tx.etr_supplier_name = etr_supplier_name
    tx.etr_supplier_pin = etr_supplier_pin
    tx.etr_number = payload.etr_number
    tx.etr_date = payload.etr_date
    tx.etr_vat_code = payload.etr_vat_code

    # Keep description/narration in sync
    if hasattr(tx, "description"):
        tx.description = payload.description
    if hasattr(tx, "narration"):
        tx.narration = payload.description

    # Remove existing lines
    tx.lines.clear()
    db.flush()

    # Add new lines
    total_amount = Decimal("0")
    new_lines = []
    for line in payload.lines:
        account = db.query(models.Account).filter(models.Account.account_code == line.account_code).first()
        if not account:
            continue
        new_line = models.BankPaymentLine(
            payment=tx,
            account_id=account.id,
            account_code=account.account_code,
            amount=float(line.amount),
        )
        new_lines.append(new_line)
        total_amount += Decimal(str(line.amount))
    tx.amount = float(total_amount)
    tx.lines = new_lines

    db.commit()
    db.refresh(tx)

    # ETR purchase logic
    if payload.payment_type == "etr_purchase":
        create_or_update_etr_purchase_for_transaction(db, tx, payload)
        db.commit()
        db.refresh(tx)

    # Paid from (bank/cash): account_id
    bank_account = db.query(models.Account).filter(models.Account.id == tx.account_id).first()
    bank_acc_name = bank_account.name if bank_account else "-"
    bank_acc_code = bank_account.account_code if bank_account else ""

    # Return all lines
    lines_out = []
    for l in tx.lines:
        acc = db.query(models.Account).filter(models.Account.id == l.account_id).first()
        lines_out.append(BankPaymentLine(
            id=l.id,
            account_id=l.account_id,
            account_code=l.account_code,
            account_name=acc.name if acc else "",
            amount=Decimal(str(l.amount)),
        ))

    return BankPaymentResponse(
        id=tx.id,
        date=tx.date,
        reference=getattr(tx, "reference", None),
        bank_account_id=tx.account_id,
        bank_account_name=bank_acc_name,
        bank_account_code=bank_acc_code,
        description=getattr(tx, "narration", None) or getattr(tx, "description", None),
        payee_type=tx.payee_type,
        payee_id=tx.payee_id,
        payee_name=tx.payee_name,
        payment_type=tx.payment_type,
        etr_supplier_name=tx.etr_supplier_name,
        etr_supplier_pin=tx.etr_supplier_pin,
        etr_number=tx.etr_number,
        etr_date=tx.etr_date,
        etr_vat_code=tx.etr_vat_code,
        currency=tx.currency if hasattr(tx, "currency") else "Ksh",
        total_amount=Decimal(str(tx.amount)),
        lines=lines_out,
    )



import csv
from io import StringIO
from datetime import datetime

@router.post("/{account_id}/import-statements", response_model=StatementImportResult)
def import_bank_statements(
    account_id: int = Path(..., description="Bank/Cash account (Chart of Accounts id)"),
    file: UploadFile = File(..., description="CSV file with bank statement lines"),
    # Optional form overrides for custom column mappings
    map_date: Optional[str] = Form(None),
    map_amount: Optional[str] = Form(None),
    map_debit: Optional[str] = Form(None),
    map_credit: Optional[str] = Form(None),
    map_reference: Optional[str] = Form(None),
    map_description: Optional[str] = Form(None),
    map_transaction_type: Optional[str] = Form(None),
    map_payee: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Import bank statement lines as BankTransactionV2 records.

    Expected CSV columns (case-insensitive):
      - date                (required, e.g. 2025-12-03 or 03/12/2025)
      - amount OR (debit + credit)
      - reference           (optional)
      - description/narration/details (optional)
      - transaction_type    (optional: deposit/withdrawal/credit/debit)

    Rules:
      - If both credit & debit exist:
            - credit > 0 -> deposit
            - debit  > 0 -> withdrawal
      - If only amount exists:
            - if transaction_type in [deposit, credit, in] -> deposit
            - if transaction_type in [withdrawal, debit, out, payment] -> withdrawal
            - else: amount > 0 -> deposit, amount < 0 -> withdrawal and abs(amount)

      - amount is always stored as positive; sign is inferred from transaction_type.
    """

    # 1) Validate bank/cash account (Chart of Accounts)
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Bank/Cash account not found")

    # 2) Read CSV content
    try:
        raw_bytes = file.file.read()
        text = raw_bytes.decode("utf-8-sig")  # strip BOM if any
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read uploaded file")

    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    # Normalise header keys
    header_map = {h.lower().strip(): h for h in reader.fieldnames if h}

    def get_val(row, *candidate_names):
        """Helper to get first non-empty value by potential column names."""
        for cname in candidate_names:
            key = cname.lower()
            if key in header_map:
                raw = row.get(header_map[key], "")
                if raw is not None and str(raw).strip() != "":
                    return str(raw).strip()
        return None

    def parse_date(value: str):
        value = value.strip()
        for fmt in (
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%Y/%m/%d",
            "%d-%m-%Y",
            "%m-%d-%Y",
            "%d.%m.%Y",
            "%d %b %Y",
            "%d %B %Y",
        ):
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
        # As a last resort, try ISO auto-parse
        try:
            return datetime.fromisoformat(value).date()
        except Exception:
            return None

    total_rows = 0
    imported = 0
    skipped = 0
    errors: list[str] = []

    BT = BankTransactionV2

    for row in reader:
        total_rows += 1

        # Skip totally empty lines
        if all((v is None or str(v).strip() == "") for v in row.values()):
            skipped += 1
            continue

        # --- Date ---
        # Respect mapping override if provided
        date_candidates = [c for c in [map_date, "date", "value date", "transaction date"] if c]
        date_str = get_val(row, *date_candidates)
        if not date_str:
            skipped += 1
            errors.append(f"Row {total_rows}: missing date")
            continue

        tx_date = parse_date(date_str)
        if not tx_date:
            skipped += 1
            errors.append(f"Row {total_rows}: invalid date '{date_str}'")
            continue

        # --- Amount & type ---
        debit_candidates = [c for c in [map_debit, "debit", "withdrawal"] if c]
        credit_candidates = [c for c in [map_credit, "credit", "deposit"] if c]
        amount_candidates = [c for c in [map_amount, "amount"] if c]

        debit_str = get_val(row, *debit_candidates)
        credit_str = get_val(row, *credit_candidates)
        amount_str = get_val(row, *amount_candidates)

        tx_type_candidates = [c for c in [map_transaction_type, "transaction_type", "type", "drcr"] if c]
        tx_type_raw = (get_val(row, *tx_type_candidates) or "").lower()

        amount = None
        tx_type = None  # 'deposit' or 'withdrawal'

        # 1) Debit + credit style
        if debit_str is not None or credit_str is not None:
            try:
                debit = float(debit_str.replace(",", "")) if debit_str else 0.0
                credit = float(credit_str.replace(",", "")) if credit_str else 0.0
            except Exception:
                skipped += 1
                errors.append(f"Row {total_rows}: invalid debit/credit values")
                continue

            if credit > 0 and debit == 0:
                amount = credit
                tx_type = "deposit"
            elif debit > 0 and credit == 0:
                amount = debit
                tx_type = "withdrawal"
            else:
                # ambiguous / both zero / both non-zero
                skipped += 1
                errors.append(
                    f"Row {total_rows}: ambiguous debit/credit combination (debit={debit}, credit={credit})"
                )
                continue

        # 2) Single amount column
        elif amount_str is not None:
            try:
                raw_amount = float(amount_str.replace(",", ""))
            except Exception:
                skipped += 1
                errors.append(f"Row {total_rows}: invalid amount '{amount_str}'")
                continue

            # Use type field if available
            if tx_type_raw in ("deposit", "credit", "cr", "in"):
                tx_type = "deposit"
                amount = abs(raw_amount)
            elif tx_type_raw in ("withdrawal", "debit", "db", "dr", "out", "payment"):
                tx_type = "withdrawal"
                amount = abs(raw_amount)
            else:
                # Infer from sign
                if raw_amount > 0:
                    tx_type = "deposit"
                    amount = raw_amount
                elif raw_amount < 0:
                    tx_type = "withdrawal"
                    amount = abs(raw_amount)
                else:
                    skipped += 1
                    errors.append(f"Row {total_rows}: zero amount, skipped")
                    continue
        else:
            skipped += 1
            errors.append(f"Row {total_rows}: missing amount (no amount/debit/credit)")
            continue

        # --- Reference & description ---
        reference_candidates = [c for c in [map_reference, "reference", "ref", "cheque no", "transaction id"] if c]
        description_candidates = [c for c in [map_description, "description", "narration", "details", "particulars"] if c]
        reference = get_val(row, *reference_candidates)
        description = get_val(row, *description_candidates)

        # --- Payee (optional) ---
        payee_candidates = [c for c in [map_payee, "payee", "name", "beneficiary name"] if c]
        payee = get_val(row, *payee_candidates)

        # Duplicate detection: match existing by account_id + date + reference + amount
        # If reference missing, fall back to narration + amount.
        existing = None
        if reference:
            existing = (
                db.query(BT)
                .filter(
                    BT.account_id == acc.id,
                    BT.date == tx_date,
                    BT.reference == reference,
                    BT.amount == float(amount),
                )
                .first()
            )
        else:
            existing = (
                db.query(BT)
                .filter(
                    BT.account_id == acc.id,
                    BT.date == tx_date,
                    BT.narration == (description or None),
                    BT.amount == float(amount),
                )
                .first()
            )
        if existing:
            skipped += 1
            errors.append(f"Row {total_rows}: duplicate detected (date={tx_date}, ref={reference or '-'}, amount={amount})")
            continue

        # Create transaction
        tx = BT(
            account_id=acc.id,        # Chart-of-Accounts bank/cash account
            date=tx_date,
            transaction_type=tx_type, # 'deposit' or 'withdrawal' (works with summaries/statements)
            amount=amount,            # ALWAYS positive
            reference=reference,
            narration=description,
            payee=payee,
        )
        db.add(tx)
        imported += 1

    db.commit()

    return StatementImportResult(
        total_rows=total_rows,
        imported_rows=imported,
        skipped_rows=skipped,
        errors=errors,
    )


@router.get("/{account_id}/scan-duplicates", response_model=DuplicateScanResult)
def scan_duplicates(
    account_id: int = Path(..., description="Bank/Cash account (Chart of Accounts id)"),
    start_date: date = Query(..., description="Start date inclusive"),
    end_date: date = Query(..., description="End date inclusive"),
    db: Session = Depends(get_db),
):
    """
    Scan a date range for potential duplicate transactions.

    Duplicate key logic (case-insensitive for reference/narration):
      - If reference present: (date, lower(reference), amount)
      - Else: (date, lower(narration), amount)
    Returns groups with count > 1.
    """
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Bank/Cash account not found")

    BT = BankTransactionV2
    txns = (
        db.query(BT)
        .filter(
            BT.account_id == account_id,
            BT.date >= start_date,
            BT.date <= end_date,
        )
        .order_by(BT.date.asc(), BT.id.asc())
        .all()
    )

    groups = {}
    for t in txns:
        ref = (getattr(t, "reference", None) or "").strip()
        narr = (getattr(t, "narration", None) or getattr(t, "description", None) or "").strip()
        amt = float(getattr(t, "amount", 0) or 0)
        # build key
        if ref:
            key = f"{t.date}|ref:{ref.lower()}|amt:{amt:.2f}"
        else:
            key = f"{t.date}|nar:{narr.lower()}|amt:{amt:.2f}"
        groups.setdefault(key, []).append(t)

    dup_groups: list[DuplicateGroup] = []
    for key, items in groups.items():
        if len(items) > 1:
            dup_groups.append(
                DuplicateGroup(
                    key=key,
                    count=len(items),
                    items=[
                        DuplicateGroupItem(
                            id=i.id,
                            date=i.date,
                            reference=getattr(i, "reference", None),
                            narration=getattr(i, "narration", None) or getattr(i, "description", None),
                            amount=float(i.amount or 0),
                        )
                        for i in items
                    ],
                )
            )

    return DuplicateScanResult(
        account_id=account_id,
        start_date=start_date,
        end_date=end_date,
        total_transactions=len(txns),
        duplicate_groups=dup_groups,
    )


class DuplicateCleanupResult(BaseModel):
    account_id: int
    start_date: date
    end_date: date
    groups_processed: int
    rows_deleted: int
    deleted_ids: list[int] = Field(default_factory=list)


@router.post("/{account_id}/cleanup-duplicates", response_model=DuplicateCleanupResult)
def cleanup_duplicates(
    account_id: int = Path(..., description="Bank/Cash account (Chart of Accounts id)"),
    start_date: date = Query(..., description="Start date inclusive"),
    end_date: date = Query(..., description="End date inclusive"),
    dry_run: bool = Query(False, description="If true, do not delete; just report ids that would be deleted"),
    db: Session = Depends(get_db),
):
    """
    Remove exact duplicates within a date range, keeping the earliest id per group.

    Duplicate key logic:
      - If reference present: (date, lower(reference), amount)
      - Else: (date, lower(narration), amount)
    """
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Bank/Cash account not found")

    BT = BankTransactionV2
    txns = (
        db.query(BT)
        .filter(
            BT.account_id == account_id,
            BT.date >= start_date,
            BT.date <= end_date,
        )
        .order_by(BT.date.asc(), BT.id.asc())
        .all()
    )

    groups = {}
    for t in txns:
        ref = (getattr(t, "reference", None) or "").strip()
        narr = (getattr(t, "narration", None) or getattr(t, "description", None) or "").strip()
        amt = float(getattr(t, "amount", 0) or 0)
        if ref:
            key = f"{t.date}|ref:{ref.lower()}|amt:{amt:.2f}"
        else:
            key = f"{t.date}|nar:{narr.lower()}|amt:{amt:.2f}"
        groups.setdefault(key, []).append(t)

    rows_deleted = 0
    deleted_ids: list[int] = []
    groups_processed = 0

    for key, items in groups.items():
        if len(items) <= 1:
            continue
        groups_processed += 1
        # Keep earliest id (items sorted by id asc via query order)
        keeper = items[0]
        to_delete = items[1:]
        for t in to_delete:
            if dry_run:
                deleted_ids.append(t.id)
            else:
                deleted_ids.append(t.id)
                db.delete(t)
                rows_deleted += 1

    if not dry_run:
        db.commit()

    return DuplicateCleanupResult(
        account_id=account_id,
        start_date=start_date,
        end_date=end_date,
        groups_processed=groups_processed,
        rows_deleted=rows_deleted,
        deleted_ids=deleted_ids,
    )


@router.get("/{account_id}/cleanup-duplicates", response_model=DuplicateCleanupResult)
def cleanup_duplicates_preview(
    account_id: int = Path(..., description="Bank/Cash account (Chart of Accounts id)"),
    start_date: date = Query(..., description="Start date inclusive"),
    end_date: date = Query(..., description="End date inclusive"),
    db: Session = Depends(get_db),
):
    """
    Convenience GET wrapper for previewing duplicate cleanup via browser.
    Always runs in dry_run mode.
    """
    return cleanup_duplicates(
        account_id=account_id,
        start_date=start_date,
        end_date=end_date,
        dry_run=True,
        db=db,
    )


@router.post("/{bank_account_id}/apply-rules", response_model=ApplyRulesResult)
def apply_rules_for_bank_account(
    bank_account_id: int = Path(..., description="BankAccountProfile ID"),
    only_uncategorised: bool = True,
    db: Session = Depends(get_db),
):
    # Validate bank account exists
    bank_acc = (
        db.query(models.BankAccountProfile)
        .filter(models.BankAccountProfile.id == bank_account_id)
        .first()
    )
    # Fallback: caller may be passing Chart of Accounts id
    if not bank_acc:
        bank_acc = (
            db.query(models.BankAccountProfile)
            .filter(models.BankAccountProfile.account_id == bank_account_id)
            .first()
        )
    if not bank_acc:
        raise HTTPException(status_code=404, detail="Bank account not found")

    result = apply_bank_rules_for_account(
        db=db,
        bank_account_profile_id=bank_acc.id,
        only_uncategorised=only_uncategorised,
    )
    return ApplyRulesResult(**result)


# Convenience endpoints without account_id in path (use Query param)
@router.get("/duplicates/scan", response_model=DuplicateScanResult)
def scan_duplicates_q(
    account_id: int = Query(..., description="Bank/Cash account (Chart of Accounts id)"),
    start_date: date = Query(..., description="Start date inclusive"),
    end_date: date = Query(..., description="End date inclusive"),
    db: Session = Depends(get_db),
):
    return scan_duplicates(account_id=account_id, start_date=start_date, end_date=end_date, db=db)


@router.post("/duplicates/cleanup", response_model=DuplicateCleanupResult)
def cleanup_duplicates_q(
    account_id: int = Query(..., description="Bank/Cash account (Chart of Accounts id)"),
    start_date: date = Query(..., description="Start date inclusive"),
    end_date: date = Query(..., description="End date inclusive"),
    dry_run: bool = Query(False, description="If true, do not delete; just report ids that would be deleted"),
    db: Session = Depends(get_db),
):
    return cleanup_duplicates(account_id=account_id, start_date=start_date, end_date=end_date, dry_run=dry_run, db=db)

@router.get("/debug/bank-transaction-ids")
def debug_list_bank_transaction_ids(db: Session = Depends(get_db)):
    from model import BankTransaction
    ids = [row.id for row in db.query(BankTransactionV2.id).all()]
    print(f"DEBUG: All BankTransaction IDs: {ids}")
    return {"ids": ids}
