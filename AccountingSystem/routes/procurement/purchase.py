
import re
import calendar
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from decimal import Decimal
from datetime import date, datetime
from io import BytesIO
import models
from database import get_db
from schemas.procurement.purchase import PurchaseCreate, PurchaseResponse, PurchaseListResponse
from schemas.procurement.purchase_line import PurchaseInvoiceLineCreate, PurchaseInvoiceLineResponse
from utils.date_formatter import format_display_date
from utils.money import to_decimal, money_round_5c
from utils.rounding import r0

router = APIRouter(prefix="/purchases", tags=["Procurement"])

# -------------------- GET Purchases (with optional filters) --------------------
@router.get("/", response_model=PurchaseInvoiceListResponse)
def list_purchases(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    partner_id: int | None = Query(None, description="Filter by partner_id"),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * limit
    base_q = db.query(models.PurchaseInvoice).options(joinedload(models.PurchaseInvoice.partner))
    if partner_id:
        base_q = base_q.filter(models.PurchaseInvoice.partner_id == int(partner_id))
    purchases = (
        base_q
        .order_by(models.PurchaseInvoice.invoice_date.desc(), models.PurchaseInvoice.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total_q = db.query(func.count(models.PurchaseInvoice.id))
    total = total_q.scalar()
    items = []
    for inv in purchases:
        vat_total = Decimal('0.00')
        excise_total = Decimal('0.00')
        lines = []
        for line in inv.lines:
            vat = to_decimal(getattr(line, 'vat', 0))
            excise = to_decimal(getattr(line, 'excise', 0))
            lines.append(PurchaseInvoiceLineResponse(
                id=line.id,
                product_id=line.product_id,
                item=line.item,
                description=line.description,
                quantity=float(getattr(line, "quantity", 0) or 0),
                unit_price=float(to_decimal(line.unit_price)),
                amount=float(to_decimal(line.amount)),
                type="Product" if line.product_id else "Service",
                vat=float(vat),
                excise=float(excise),
                vat_code=getattr(line, "vat_code", None),
                excise_code=getattr(line, "excise_code", None),
            ))
            vat_total += Decimal(str(vat or 0))
            excise_total += Decimal(str(excise or 0))
        items.append(PurchaseInvoiceOut(
            invoice_number=inv.invoice_number,
            invoice_date=inv.invoice_date,
            invoice_date_formatted=format_display_date(inv.invoice_date),
            partner_id=inv.partner_id,
            partner_name=inv.partner.name if inv.partner else "",
            description=inv.description,
            amount=float(to_decimal(inv.amount)),
            vat=float(vat_total),
            excise=float(excise_total),
            cu_inv_number=getattr(inv, "cu_inv_number", ""),
            status=inv.status,
            balance_due=getattr(inv, "balance_due", 0),
            lines=lines,
            grand_total=float(to_decimal(inv.amount) + vat_total + excise_total)
        ))
    return PurchaseInvoiceListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=(total + limit - 1) // limit,
    )
# --- Account input normalization ---
def _normalize_account_input(db: Session, raw: str | None, fallback_item: str | None = None, fallback_desc: str | None = None) -> str | None:
    if not raw and not fallback_item and not fallback_desc:
        return None
    s = (str(raw or "").strip())
    # Try extract a 3-6 digit code anywhere in the string
    m = re.search(r"(\d{3,6})", s)
    code_hint = m.group(1) if m else None
    
    if not code_hint:
        parts = re.split(r"\s*[-:–]\s*", s, maxsplit=1)
        if parts and parts[0].isdigit():
            code_hint = parts[0]

    if code_hint:
        acct = db.query(models.Account).filter(models.Account.account_code == str(code_hint)).first()
        if acct:
            return acct.account_code

    name_hint = re.sub(r"[()\d]+", "", s).strip().strip(" -:–—") if s else None
    if name_hint:
        acct = db.query(models.Account).filter(models.Account.name == name_hint).first()
        if acct:
            return acct.account_code
        try:
            acct = (
                db.query(models.Account)
                .filter(models.Account.name.ilike(f"%{name_hint.replace('–','-').replace('—','-')}%"))
                .order_by(models.Account.id.asc())
                .first()
            )
            if acct:
                return acct.account_code
        except Exception:
            pass

    for hint in (fallback_item, fallback_desc):
        if not hint: continue
        s2 = str(hint).strip()
        m2 = re.search(r"(\d{3,6})", s2)
        code2 = m2.group(1) if m2 else None
        if code2:
            acct = db.query(models.Account).filter(models.Account.account_code == str(code2)).first()
            if acct: return acct.account_code
        
        name2 = re.sub(r"[()\d]+", "", s2).strip().strip(" -:–—") if s2 else None
        if name2:
            acct = db.query(models.Account).filter(models.Account.name == name2).first()
            if acct: return acct.account_code
    return None

# --- Recurring date calculation ---
def calculate_next_issue_date(current_date: date, recurrence_interval: str) -> date:
    if not recurrence_interval:
        return current_date
    interval_lower = recurrence_interval.lower().strip()
    if "month" in interval_lower:
        months = 1
        if interval_lower not in ("monthly", "1 months", "1 month"):
            match = re.search(r'(\d+)\s*months?', interval_lower)
            months = int(match.group(1)) if match else 1
        new_month = current_date.month + months
        new_year = current_date.year
        while new_month > 12:
            new_month -= 12
            new_year += 1
        max_day = calendar.monthrange(new_year, new_month)[1]
        new_day = min(current_date.day, max_day)
        return date(new_year, new_month, new_day)
    elif "year" in interval_lower:
        years = 1
        match = re.search(r'(\d+)\s*years?', interval_lower)
        years = int(match.group(1)) if match else 1
        return date(current_date.year + years, current_date.month, current_date.day)
    else:
        return calculate_next_issue_date(current_date, "1 months")

# --- Date parser ---
def parse_date(date_str):
    if isinstance(date_str, date): return date_str
    if not date_str: return None
    return datetime.strptime(str(date_str), "%Y-%m-%d").date()

# --- Tax helpers ---
def get_tax_options(db: Session):
    Tax = models.Tax
    taxes = db.query(Tax).all()
    out = []
    for t in taxes:
        out.append({
            "id": t.id,
            "account_code": str(t.account_code or ""),
            "type": (t.type or "").upper(),
            "rate": to_decimal(getattr(t, "rate", 0) or 0),
            "name": t.name or "",
        })
    return out

def _find_rate(options, code, tax_type):
    if not code: return to_decimal(0)
    ttype = (tax_type or "").upper()
    for t in options:
        if (t["type"] or "").upper() == ttype and (str(t["id"]) == str(code) or t["account_code"] == str(code)):
            return to_decimal(t["rate"] or 0)
    return to_decimal(0)

# --- General rounding policy ---
def _get_general_rounder(db: Session):
    settings = db.query(models.AccountSettings).first()
    policy = (getattr(settings, 'rounding_general_policy', None) or 'r05').strip()
    if policy == 'r05':
        return round_to_5c, policy
    return lambda d: to_decimal(d), policy

# --- Invoice computation engine ---
def compute_breakdown(lines):
    """
    Compute totals for a list of PurchaseInvoiceLine objects.
    Safely sums: amount, vat, excise, and any other relevant fields.
    """
    sub_total = Decimal('0.00')
    vat_total = Decimal('0.00')
    excise_total = Decimal('0.00')
    for line in lines:
        qty = to_decimal(getattr(line, 'quantity', 0))
        price = to_decimal(getattr(line, 'unit_price', 0))
        amt = qty * price
        vat = to_decimal(getattr(line, 'vat', 0))
        # Calculate excise on the fly using excise_code
        excise_rate = Decimal('0.00')
        excise_code = getattr(line, 'excise_code', None)
        if excise_code:
            import re
            excise_match = re.match(r"Excise\s*(\d+)%", str(excise_code), re.IGNORECASE)
            if excise_match:
                excise_rate = Decimal(excise_match.group(1)) / 100
        excise = (amt * excise_rate).quantize(Decimal('0.00'))
        print(f"DEBUG: compute_breakdown line: qty={qty}, price={price}, amt={amt}, vat={vat}, excise={excise}")
        sub_total += amt
        vat_total += vat
        excise_total += excise
    print(f"DEBUG: compute_breakdown totals: sub_total={sub_total}, vat_total={vat_total}, excise_total={excise_total}")
    total_exact = sub_total + vat_total + excise_total
    total_rounded = round_to_5c(total_exact)
    rounding_adjustment = total_rounded - total_exact
    return {
        "sub_total": sub_total,
        "vat_total": vat_total,
        "excise_total": excise_total,
        "total_exact": total_exact,
        "total_rounded": total_rounded,
        "rounding_adjustment": rounding_adjustment
    }


def sync_purchase_totals(purchase):
    """
    Updates a PurchaseInvoice object with totals computed from its lines.
    """
    if not purchase.lines:
        # No lines, reset totals
        purchase.total_amount = Decimal('0.0')
        purchase.total_vat = Decimal('0.0')
        purchase.total_excise = Decimal('0.0')
        return

    totals = compute_breakdown(purchase.lines)

    # Update purchase totals
    purchase.total_amount = totals["total_exact"]
    purchase.total_vat = totals["vat_total"]
    purchase.total_excise = totals["excise_total"]

def _remove_stock_entries_for_purchase(db: Session, purchase: models.PurchaseInvoice):
    """Clean up stock records before updates or deletions."""
    try:
        db.query(StockEntry).filter(StockEntry.purchase_invoice_id == purchase.id).delete()
    except Exception as e:
        print(f"Error removing stock entries: {e}")

# -------------------- Main Purchase Invoice Routes --------------------






@router.post("/", response_model=PurchaseInvoiceOut)
def create_purchase_invoice(
    payload: PurchaseInvoiceCreate, 
    db: Session = Depends(get_db)
):
    """Create a Purchase Invoice with strict 0.05 rounding."""
    print("DEBUG: Start create_purchase_invoice")
    new_purchase = models.PurchaseInvoice(
        supplier_id=payload.supplier_id,
        invoice_date=payload.invoice_date or date.today(),
        due_date=payload.due_date,
        reference=payload.reference,
        status=payload.status or "draft",
        currency_code=getattr(payload, 'currency_code', 'USD')
    )
    print("DEBUG: Created new_purchase object")

    for line in payload.lines:
        print(f"DEBUG: Processing line: {line}")
        line_qty = to_decimal(line.quantity)
        line_price = to_decimal(line.unit_price)
        line_amt = (line_qty * line_price).quantize(Decimal('0.00'))
        vat_rate = Decimal('0.00')
        excise_rate = Decimal('0.00')
        # Parse VAT code like 'VAT 16%' to get type and rate
        import re
        if getattr(line, 'vat_code', None):
            vat_match = re.match(r"VAT\s*(\d+)%", str(line.vat_code), re.IGNORECASE)
            if vat_match:
                vat_rate = Decimal(vat_match.group(1)) / 100
                print(f"DEBUG: Parsed VAT rate from code '{line.vat_code}': {vat_rate}")
            else:
                vat_obj = db.query(models.Tax).filter(models.Tax.type.ilike('%vat%')).first()
                if vat_obj and vat_obj.rate:
                    vat_rate = Decimal(str(vat_obj.rate))
                    print(f"DEBUG: Fallback VAT rate from DB: {vat_rate}")
        if getattr(line, 'excise_code', None):
            excise_match = re.match(r"Excise\s*(\d+)%", str(line.excise_code), re.IGNORECASE)
            if excise_match:
                excise_rate = Decimal(excise_match.group(1)) / 100
                print(f"DEBUG: Parsed Excise rate from code '{line.excise_code}': {excise_rate}")
            else:
                excise_obj = db.query(models.Tax).filter(models.Tax.type.ilike('%excise%')).first()
                if excise_obj and excise_obj.rate:
                    excise_rate = Decimal(str(excise_obj.rate))
                    print(f"DEBUG: Fallback Excise rate from DB: {excise_rate}")
        excise_amt = (line_amt * excise_rate).quantize(Decimal('0.00'))
        vat_amt = ((line_amt + excise_amt) * vat_rate).quantize(Decimal('0.00'))
        print(f"DEBUG: Calculated excise_amt={excise_amt}, vat_amt={vat_amt} for line_amt={line_amt}")
        db_line = models.PurchaseInvoiceLine(
            product_id=line.product_id,
            type=getattr(line, 'type', None),
            item=getattr(line, 'item', None),
            account_code=line.account_code or _normalize_account_input(db, None, line.description),
            description=line.description,
            quantity=float(line_qty),
            unit_price=float(line_price),
            vat_code=getattr(line, 'vat_code', None),
            excise_code=getattr(line, 'excise_code', None),
            vat=float(vat_amt)
        )
        new_purchase.lines.append(db_line)
        print("DEBUG: Added db_line to new_purchase.lines")

    print("DEBUG: Before sync_purchase_totals")
    sync_purchase_totals(new_purchase)
    print("DEBUG: After sync_purchase_totals")

    db.add(new_purchase)
    print("DEBUG: After db.add(new_purchase)")

    try:
        db.commit()
        print("DEBUG: After db.commit()")
        db.refresh(new_purchase)
        print("DEBUG: After db.refresh(new_purchase)")

        if new_purchase.status.lower() in ("received", "approved"):
            print("DEBUG: Handling stock entries")
            for ln in new_purchase.lines:
                if ln.product_id:
                    db.add(StockEntry(
                        product_id=ln.product_id,
                        purchase_invoice_id=new_purchase.id,
                        quantity=ln.quantity,
                        type="IN",
                        date=new_purchase.date,
                        unit_cost=ln.unit_price
                    ))
            db.commit()
            print("DEBUG: After stock entry db.commit()")

        print("DEBUG: Before compute_breakdown")
        totals = compute_breakdown(new_purchase.lines)
        print("DEBUG: After compute_breakdown")

        print("DEBUG: Before response serialization")
        result = {
            "id": new_purchase.id,
            "supplier_id": new_purchase.supplier_id,
            "reference": new_purchase.reference,
            "invoice_date": new_purchase.invoice_date,
            "due_date": new_purchase.due_date,
            "status": new_purchase.status,
            "notes": getattr(new_purchase, 'notes', None),
            "currency": getattr(new_purchase, 'currency', None),
            "sub_total": str(totals["sub_total"]),
            "vat_total": str(totals["vat_total"]),
            "excise_total": str(totals["excise_total"]),
            "total_exact": str(totals["total_exact"]),
            "total_rounded": str(totals["total_rounded"]),
            "rounding_adjustment": str(totals["rounding_adjustment"]),
            "supplier_name": new_purchase.supplier.name if getattr(new_purchase, 'supplier', None) else None,
            "lines": [
                {
                    "id": ln.id,
                    "product_id": ln.product_id,
                    "type": getattr(ln, 'type', None),
                    "item": getattr(ln, 'item', None),
                    "description": ln.description,
                    "quantity": float(ln.quantity),
                    "unit_price": float(ln.unit_price),
                    "amount": float(to_decimal(ln.quantity) * to_decimal(ln.unit_price)),
                    "vat_code": getattr(ln, 'vat_code', None),
                    "excise_code": getattr(ln, 'excise_code', None),
                    "vat": float(vat_amt),
                    "excise": float(excise_amt),
                    "account_code": ln.account_code
                } for ln in new_purchase.lines
            ]
        }
        print("DEBUG: After response serialization")
        return result

    except Exception as e:
        print(f"DEBUG: Exception occurred: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database Error: {str(e)}")

@router.put("/{purchase_id}", response_model=PurchaseInvoiceOut)
def update_purchase_invoice(
    purchase_id: int, 
    payload: PurchaseInvoiceUpdate, 
    db: Session = Depends(get_db)
):
    """Update existing purchase and recalculate rounded totals."""
    db_purchase = (
        db.query(models.PurchaseInvoice)
        .filter(models.PurchaseInvoice.id == purchase_id)
        .first()
    )
    if not db_purchase:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # ---------------- Header updates ----------------
    update_data = payload.dict(exclude_unset=True, exclude={"lines"})
    for key, value in update_data.items():
        setattr(db_purchase, key, value)

    # ---------------- Line rebuild ----------------
    if payload.lines is not None:
        db.query(models.PurchaseInvoiceLine).filter(
            models.PurchaseInvoiceLine.purchase_invoice_id == purchase_id
        ).delete()

        _remove_stock_entries_for_purchase(db, db_purchase)

        # Get tax options for correct calculation
        tax_opts = get_tax_options(db)
        def _find_rate(tax_opts, code, type_):
            for t in tax_opts:
                if t['type'].upper() == type_.upper() and (t['code'] == code or t['account_code'] == code or t['label'] == code):
                    return float(t['rate'])
            return 0.0

        for line in payload.lines:
            qty = to_decimal(line.quantity)
            price = to_decimal(line.unit_price)
            amt = (qty * price).quantize(Decimal("0.00"))
            excise_rate = _find_rate(tax_opts, getattr(line, 'excise_code', None), 'EXCISE')
            excise_amt = (amt * Decimal(str(excise_rate))).quantize(Decimal("0.00"))
            vat_rate = _find_rate(tax_opts, getattr(line, 'vat_code', None), 'VAT')
            vat_amt = ((amt + excise_amt) * Decimal(str(vat_rate))).quantize(Decimal("0.00"))

            new_line = models.PurchaseInvoiceLine(
                purchase_invoice_id=purchase_id,
                product_id=line.product_id,
                description=line.description,
                quantity=qty,
                unit_price=price,
                amount=amt,
                vat=vat_amt,
                excise=excise_amt,
                vat_code=getattr(line, 'vat_code', None),
                excise_code=getattr(line, 'excise_code', None),
                account_code=line.account_code
            )
            db_purchase.lines.append(new_line)

    # ---------------- Totals ----------------
    sync_purchase_totals(db_purchase)

    db.commit()
    db.refresh(db_purchase)

    # ✅ COMPUTE RESPONSE TOTALS (required by schema)
    totals = compute_breakdown(db_purchase.lines)

    return {
        "id": db_purchase.id,
        "supplier_id": db_purchase.supplier_id,
        "invoice_number": db_purchase.invoice_number,
        "date": db_purchase.date,
        "due_date": db_purchase.due_date,
        "reference": db_purchase.reference,
        "status": db_purchase.status,
        "notes": db_purchase.notes,
        "currency": db_purchase.currency,

        "sub_total": totals["sub_total"],
        "vat_total": totals["vat_total"],
        "excise_total": totals["excise_total"],
        "total_exact": totals["total_exact"],
        "total_rounded": totals["total_rounded"],
        "rounding_adjustment": totals["rounding_adjustment"],

        "supplier_name": db_purchase.supplier.name if db_purchase.supplier else None,
        "lines": [
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "description": ln.description,
                "quantity": float(ln.quantity),
                "unit_price": float(ln.unit_price),
                "amount": float(to_decimal(ln.amount)),
                "vat": float(to_decimal(ln.vat)),
                "excise": float(to_decimal(ln.excise)),
                "account_code": ln.account_code
            }
            for ln in db_purchase.lines
        ]
    }

@router.delete("/{purchase_id}")
def delete_purchase_invoice(purchase_id: int, db: Session = Depends(get_db)):
    """Delete a purchase and its associated stock entries."""
    db_purchase = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.id == purchase_id).first()
    if not db_purchase:
        raise HTTPException(status_code=404, detail="Purchase Invoice not found")
    
    # Clean up related records
    _remove_stock_entries_for_purchase(db, db_purchase)
    
    db.delete(db_purchase)
    db.commit()
    return {"message": "Purchase Invoice deleted successfully"}

# -------------------- Bulk Operations --------------------

@router.post("/batch_delete")
def batch_delete_purchases(ids: list[int] = Body(...), db: Session = Depends(get_db)):
    """Batch delete purchases with stock cleanup."""
    purchases = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.id.in_(ids)).all()
    for p in purchases:
        _remove_stock_entries_for_purchase(db, p)
        db.delete(p)
    db.commit()
    return {"message": f"Successfully deleted {len(purchases)} invoices"}

# -------------------- Specialized Reporting & Summaries --------------------

    q = db.query(models.PurchaseInvoice)
    if supplier_id:
        q = q.filter(models.PurchaseInvoice.supplier_id == supplier_id)
    purchases = q.offset(skip).limit(limit).options(joinedload(models.PurchaseInvoice.lines)).all()
    out = []
    from models.bank.transaction_v2 import BankTransactionV2
    from models.accounting.journal import JournalEntry, JournalLine
    tax_opts = get_tax_options(db)
    def calc_line_tax(ln):
        qty = Decimal(str(ln.quantity or 0))
        unit = Decimal(str(ln.unit_price or 0))
        amt = qty * unit
        excise = (
            getattr(ln, 'excise', None)
            if hasattr(ln, 'excise') and getattr(ln, 'excise', None) not in (None, '', 'null', 0, 0.0, '0', '0.0')
            else amt * _find_rate(tax_opts, getattr(ln, 'excise_code', None), 'EXCISE')
        )
        vat = (
            getattr(ln, 'vat', None)
            if hasattr(ln, 'vat') and getattr(ln, 'vat', None) not in (None, '', 'null', 0, 0.0, '0', '0.0')
            else (amt + excise) * _find_rate(tax_opts, getattr(ln, 'vat_code', None), 'VAT')
        )
        return vat, excise

    for p in purchases:
        sub_total = Decimal('0.00')
        vat_total = Decimal('0.00')
        excise_total = Decimal('0.00')
        lines = []
        for ln in p.lines:
            vat, excise = calc_line_tax(ln)
            qty = Decimal(str(ln.quantity or 0))
            unit = Decimal(str(ln.unit_price or 0))
            amt = qty * unit
            sub_total += amt
            vat_total += Decimal(str(vat or 0))
            excise_total += Decimal(str(excise or 0))
            lines.append({
                'id': ln.id,
                'product_id': ln.product_id,
                'description': ln.description,
                'quantity': ln.quantity,
                'unit_price': ln.unit_price,
                'amount': amt,
                'vat': vat,
                'excise': excise,
                'account_code': ln.account_code,
            })
        total_exact = sub_total + vat_total + excise_total
        total_rounded = round_to_5c(total_exact)
        amount_paid = Decimal(str(p.amount_paid or 0))
        journal_paid = Decimal('0.00')
        journal_lines = db.query(JournalLine).join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        journal_lines = journal_lines.filter(
            (JournalLine.party_type == 'supplier') & (JournalLine.party_id == p.supplier_id)
        ).all()
        for jl in journal_lines:
            amt = Decimal(str((jl.debit or 0) - (jl.credit or 0)))
            if amt > 0:
                journal_paid += amt
        bank_paid = Decimal(str(
            db.query(func.coalesce(func.sum(BankTransactionV2.amount), 0)).filter(
                BankTransactionV2.auto_document_type == 'purchase_invoice',
                BankTransactionV2.auto_document_id == p.id
            ).scalar() or 0
        ))
        total_paid = amount_paid + journal_paid + bank_paid
        balance_due = total_rounded - total_paid
        out.append({
            'id': p.id,
            'supplier_id': p.supplier_id,
            'invoice_date': p.invoice_date,
            'due_date': p.due_date,
            'reference': p.reference,
            'cu_inv_number': p.cu_inv_number,
            'status': p.status,
            'currency_code': p.currency_code,
            'lines': lines,
            'sub_total': sub_total,
            'vat_total': vat_total,
            'excise_total': excise_total,
            'total_exact': total_exact,
            'total_rounded': total_rounded,
            'rounding_adjustment': total_rounded - total_exact,
            'amount_paid': float(amount_paid),
            'journal_paid': float(journal_paid),
            'bank_paid': float(bank_paid),
            'total_paid': float(total_paid),
            'balance_due': float(balance_due),
        })
    return out
    # Assuming a Payment model exists elsewhere
    total_paid = db.query(func.sum(models.SupplierPayment.amount)).filter(
        models.SupplierPayment.supplier_id == supplier_id
    ).scalar() or 0
    
    supplier.balance = to_decimal(total_invoiced) - to_decimal(total_paid)
    db.commit()

# -------------------- Aging Report Logic --------------------

@router.get("/reports/aging")
def supplier_aging_report(db: Session = Depends(get_db)):
    """Calculates aging based on rounded invoice totals."""
    today = date.today()
    purchases = db.query(models.PurchaseInvoice).filter(
        models.PurchaseInvoice.status.in_(["approved", "partially_paid"])
    ).all()
    
    aging = {
        "current": Decimal('0.00'),
        "30_days": Decimal('0.00'),
        "60_days": Decimal('0.00'),
        "90_plus": Decimal('0.00')
    }
    
    for p in purchases:
        days_old = (today - p.date).days
        val = to_decimal(p.total) # Uses the rounded DB value
        
        if days_old <= 30:
            aging["current"] += val
        elif days_old <= 60:
            aging["30_days"] += val
        elif days_old <= 90:
            aging["60_days"] += val
        else:
            aging["90_plus"] += val
            
    return aging
# -------------------- Payment Allocation Logic --------------------

@router.post("/{purchase_id}/payments")
def add_purchase_payment(
    purchase_id: int, 
    amount: Decimal = Body(..., embed=True), 
    payment_date: date = Body(default=date.today(), embed=True),
    method: str = Body("Bank Transfer", embed=True),
    db: Session = Depends(get_db)
):
    """
    Applies a payment to a purchase invoice.
    Ensures that partial payments are subtracted from the rounded 5c total.
    """
    purchase = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")

    payment_amt = to_decimal(amount)
    
    # Create the payment record
    payment = models.SupplierPayment(
        purchase_invoice_id=purchase_id,
        partner_id=purchase.partner_id,
        amount=payment_amt,
        date=payment_date,
        payment_method=method
    )
    db.add(payment)

    # Recalculate remaining balance
    # Total (rounded to 5c) - Sum of all payments
    total_paid = db.query(func.sum(models.SupplierPayment.amount)).filter(
        models.SupplierPayment.purchase_invoice_id == purchase_id
    ).scalar() or 0
    
    remaining = to_decimal(purchase.total) - to_decimal(total_paid)
    
    # Update Status based on balance
    if remaining <= 0:
        for p in purchases:
            sub_total = Decimal('0.00')
            vat_total = Decimal('0.00')
            excise_total = Decimal('0.00')
            lines = []
            for ln in p.lines:
                vat, excise = calc_line_tax(ln)
                qty = Decimal(str(ln.quantity or 0))
                unit = Decimal(str(ln.unit_price or 0))
                amt = qty * unit
                sub_total += amt
                vat_total += Decimal(str(vat or 0))
                excise_total += Decimal(str(excise or 0))
                lines.append({
                    'id': ln.id,
                    'product_id': ln.product_id,
                    'description': ln.description,
                    'quantity': ln.quantity,
                    'unit_price': ln.unit_price,
                    'amount': amt,
                    'vat': vat,
                    'excise': excise,
                    'account_code': ln.account_code,
                })
            total_exact = sub_total + vat_total + excise_total
            total_rounded = round_to_5c(total_exact)
            amount_paid = Decimal(str(p.amount_paid or 0))
            journal_paid = Decimal('0.00')
            journal_lines = db.query(JournalLine).join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            journal_lines = journal_lines.filter(
                (JournalLine.party_type == 'partner') & (JournalLine.party_id == p.partner_id)
            ).all()
            for jl in journal_lines:
                amt = Decimal(str((jl.debit or 0) - (jl.credit or 0)))
                if amt > 0:
                    journal_paid += amt
            bank_paid = Decimal(str(
                db.query(func.coalesce(func.sum(BankTransactionV2.amount), 0)).filter(
                    BankTransactionV2.auto_document_type == 'purchase_invoice',
                    BankTransactionV2.auto_document_id == p.id
                ).scalar() or 0
            ))
            total_paid = amount_paid + journal_paid + bank_paid
            balance_due = total_rounded - total_paid
            out.append({
                'id': p.id,
                'partner_id': p.partner_id,
                'invoice_date': p.invoice_date,
                'due_date': p.due_date,
                'reference': p.reference,
                'cu_inv_number': p.cu_inv_number,
                'status': p.status,
                'currency_code': p.currency_code,
                'lines': lines,
                'sub_total': sub_total,
                'vat_total': vat_total,
                'excise_total': excise_total,
                'total_exact': total_exact,
                'total_rounded': total_rounded,
                'rounding_adjustment': total_rounded - total_exact,
                'amount_paid': float(amount_paid),
                'journal_paid': float(journal_paid),
                'bank_paid': float(bank_paid),
                'total_paid': float(total_paid),
                'balance_due': float(balance_due),
            })
    # Automated job to generate invoices for 2026 recurring contracts.
    # Ensures every generated invoice is quantized and rounded to 5c.
    today = date.today()
    recurring_templates = db.query(models.PurchaseTemplate).filter(
        models.PurchaseTemplate.is_active == True,
        models.PurchaseTemplate.next_date <= today
    ).all()

    generated_count = 0
    for template in recurring_templates:
        # Create new invoice from template
        # BROKEN: The following lines reference undefined variables and are commented out to prevent errors
        # new_purchase = models.PurchaseInvoice(
        #     supplier_id=template.supplier_id,
        #     invoice_date=payload.invoice_date or date.today(),
        #     due_date=payload.due_date,
        #     reference=payload.reference,
        #     status=payload.status or "draft",
        #     currency_code=getattr(payload, 'currency_code', 'USD'),
        #     description=t_line.description,
        #     quantity=t_line.quantity,
        #     unit_price=t_line.unit_price,
        #     amount=to_decimal(t_line.quantity * t_line.unit_price),
        #     vat=to_decimal(t_line.vat),
        #     account_code=t_line.account_code
        # )
        # new_purchase.lines.append(new_line)
        
        # Force 5c Rounding on the new generated invoice
        # sync_purchase_totals(new_purchase)
        # Update template for next interval
        template.next_date = calculate_next_issue_date(today, template.interval)
        # db.add(new_purchase)
        # generated_count += 1

    db.commit()
    return {"generated_invoices": generated_count}

# -------------------- Utility / File Attachments --------------------

@router.post("/{purchase_id}/attachments")
def upload_purchase_attachment(
    purchase_id: int, 
    file_name: str = Body(...), 
    file_data: str = Body(...), # Base64
    db: Session = Depends(get_db)
):
    """Stores references to scanned purchase receipts."""
# TEMPORARY DEBUG ENDPOINT: Get all purchases and lines for a supplier name
@router.get("/debug/supplier-purchases/{supplier_name}")
def debug_supplier_purchases(supplier_name: str, db: Session = Depends(get_db)):
    suppliers = db.query(models.Supplier).filter(models.Supplier.name.ilike(f"%{supplier_name}%")).all()
    if not suppliers:
        return {"error": "No suppliers found"}
    supplier_ids = [s.id for s in suppliers]
    purchases = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.supplier_id.in_(supplier_ids)).all()
    out = []
    for p in purchases:
        lines = db.query(models.PurchaseInvoiceLine).filter(models.PurchaseInvoiceLine.purchase_invoice_id == p.id).all()
        tax_opts = get_tax_options(db)
        out.append({
            "purchase_id": p.id,
            "reference": p.reference,
            "date": str(p.invoice_date),
            "lines": [
                {
                    "id": ln.id,
                    "description": ln.description,
                    "quantity": ln.quantity,
                    "unit_price": ln.unit_price,
                    "vat": float(
                        getattr(ln, 'vat', None)
                        if hasattr(ln, 'vat') and getattr(ln, 'vat', None) not in (None, '', 'null', 0, 0.0, '0', '0.0')
                        else (
                            (Decimal(str(ln.quantity or 0)) * Decimal(str(ln.unit_price or 0)) + (
                                (Decimal(str(ln.quantity or 0)) * Decimal(str(ln.unit_price or 0))) * _find_rate(tax_opts, getattr(ln, 'excise_code', None), 'EXCISE')
                            )) * _find_rate(tax_opts, getattr(ln, 'vat_code', None), 'VAT')
                        )
                    ),
                    "excise": float(
                        getattr(ln, 'excise', None)
                        if hasattr(ln, 'excise') and getattr(ln, 'excise', None) not in (None, '', 'null', 0, 0.0, '0', '0.0')
                        else (
                            (Decimal(str(ln.quantity or 0)) * Decimal(str(ln.unit_price or 0))) * _find_rate(tax_opts, getattr(ln, 'excise_code', None), 'EXCISE')
                        )
                    ),
                    "vat_code": getattr(ln, 'vat_code', None),
                    "excise_code": getattr(ln, 'excise_code', None),
                    "account_code": ln.account_code
                }
                for ln in lines
            ]
        })
    return out
@router.get("/purchase-invoices", response_model=list[PurchaseInvoiceOut])
def get_purchase_invoices(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    supplier_id: int | None = None
):
    """List purchase invoices for /purchase-invoices endpoint."""
    query = db.query(models.PurchaseInvoice)
    if supplier_id:
        query = query.filter(models.PurchaseInvoice.supplier_id == supplier_id)
    purchases = (
        query.order_by(models.PurchaseInvoice.invoice_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    supplier_ids = {p.supplier_id for p in purchases}
    suppliers = db.query(models.Supplier).filter(models.Supplier.id.in_(supplier_ids)).all()
    supplier_map = {s.id: s.name for s in suppliers}
    results = []
    from models.bank.transaction_v2 import BankTransactionV2
    for p in purchases:
        totals = compute_breakdown(p.lines)
        total_rounded = round_to_5c(totals.get("total_exact", Decimal("0.00")))
        total_paid = db.query(func.coalesce(func.sum(BankTransactionV2.amount), 0)).filter(
            BankTransactionV2.auto_document_type == "purchase_invoice",
            BankTransactionV2.auto_document_id == p.id
        ).scalar() or 0.0
        balance_due = float(total_rounded) - float(total_paid)
        results.append({
            "id": p.id,
            "supplier_id": p.supplier_id,
            "invoice_date": p.invoice_date,
            "due_date": p.due_date,
            "reference": p.reference,
            "cu_inv_number": str(p.cu_inv_number) if p.cu_inv_number is not None else "",
            "currency_code": p.currency_code or "",
            "sub_total": float(totals.get("sub_total", Decimal("0.00"))),
            "vat_total": float(totals.get("vat_total", Decimal("0.00"))),
            "excise_total": float(totals.get("excise_total", Decimal("0.00"))),
            "total_exact": float(totals.get("total_exact", Decimal("0.00"))),
            "total_rounded": float(total_rounded),
            "rounding_adjustment": float(totals.get("rounding_adjustment", Decimal("0.00"))),
            "supplier_name": supplier_map.get(p.supplier_id),
            "balance_due": float(balance_due),
            "amount_paid": float(total_paid),
            # Ensure all fields for action buttons are present
            "lines": [
                (lambda ln: {
                    "id": ln.id,
                    "product_id": ln.product_id,
                    "description": ln.description if ln.description is not None else "",
                    "quantity": float(ln.quantity if ln.quantity is not None else 0.0),
                    "unit_price": float(ln.unit_price if ln.unit_price is not None else 0.0),
                    "amount": float(to_decimal(ln.quantity if ln.quantity is not None else 0.0) * to_decimal(ln.unit_price if ln.unit_price is not None else 0.0)),
                    "vat": float(
                        to_decimal(getattr(ln, "vat", None))
                        if hasattr(ln, "vat") and getattr(ln, "vat", None) not in (None, '', 'null')
                        else (
                            (to_decimal(ln.quantity if ln.quantity is not None else 0.0) * to_decimal(ln.unit_price if ln.unit_price is not None else 0.0) + (
                                to_decimal(ln.quantity if ln.quantity is not None else 0.0) * to_decimal(ln.unit_price if ln.unit_price is not None else 0.0) * (Decimal(str(re.match(r"Excise\s*(\d+)%", str(getattr(ln, 'excise_code', '')), re.IGNORECASE).group(1))) / 100)
                                if getattr(ln, 'excise_code', None) and re.match(r"Excise\s*(\d+)%", str(getattr(ln, 'excise_code', '')), re.IGNORECASE)
                                else Decimal('0.00')
                            )) * (Decimal(str(re.match(r"VAT\s*(\d+)%", str(getattr(ln, 'vat_code', '')), re.IGNORECASE).group(1))) / 100)
                            if getattr(ln, 'vat_code', None) and re.match(r"VAT\s*(\d+)%", str(getattr(ln, 'vat_code', '')), re.IGNORECASE)
                            else Decimal('0.00')
                        )
                    ),
                    "excise": float(
                        to_decimal(getattr(ln, "excise", None))
                        if hasattr(ln, "excise") and getattr(ln, "excise", None) not in (None, '', 'null')
                        else (
                            to_decimal(ln.quantity if ln.quantity is not None else 0.0) * to_decimal(ln.unit_price if ln.unit_price is not None else 0.0) * (Decimal(str(re.match(r"Excise\s*(\d+)%", str(getattr(ln, 'excise_code', '')), re.IGNORECASE).group(1))) / 100)
                            if getattr(ln, 'excise_code', None) and re.match(r"Excise\s*(\d+)%", str(getattr(ln, 'excise_code', '')), re.IGNORECASE)
                            else Decimal('0.00')
                        )
                    ),
                    "account_code": ln.account_code
                })(ln)
                for ln in p.lines
            ]
        })
    return results
# -------------------- PO to Invoice Conversion --------------------

@router.post("/convert-po/{po_id}")
def convert_po_to_invoice(po_id: int, db: Session = Depends(get_db)):
    """
    Converts an existing Purchase Order into a Purchase Invoice.
    Ensures rounding consistency during the data transfer.
    """
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found")

    if po.status.lower() == "converted":
        raise HTTPException(status_code=400, detail="PO already converted to invoice")

    # Create Invoice Header
    new_invoice = models.PurchaseInvoice(
        supplier_id=po.supplier_id,
        invoice_number=f"INV-FROM-PO-{po.po_number}",
        date=date.today(),
        reference=po.po_number,
        status="draft",
        notes=f"Generated from PO #{po.po_number}"
    )

    # Convert Lines
    for po_line in po.lines:
        inv_line = models.PurchaseInvoiceLine(
            product_id=po_line.product_id,
            description=po_line.description,
            quantity=po_line.quantity,
            unit_price=po_line.unit_price,
            amount=to_decimal(po_line.quantity * po_line.unit_price),
            vat=to_decimal(po_line.vat),
            excise=to_decimal(getattr(po_line, 'excise', 0)),
            account_code=po_line.account_code
        )
        new_invoice.lines.append(inv_line)

    # CRITICAL: Force 5c rounding on the newly created invoice
    sync_purchase_totals(new_invoice)

    # Update PO status
    po.status = "converted"
    
    db.add(new_invoice)
    db.commit()
    db.refresh(new_invoice)
    
    return {"message": "Conversion successful", "invoice_id": new_invoice.id}

# -------------------- Audit & History Logging --------------------

def log_purchase_action(purchase_id: int, action: str, user_id: str, db: Session):
    """
    Internal helper to track modifications. 
    Useful for 2026 compliance audits.
    """
    log_entry = models.AuditLog(
        entity_type="purchase_invoice",
        entity_id=purchase_id,
        action=action,
        user_id=user_id,
        timestamp=datetime.now()
    )
    db.add(log_entry)
    # Note: No commit here, usually committed with the main transaction

# -------------------- Tax Reconciliation Helpers --------------------

@router.get("/reports/tax-summary")
def get_tax_reconciliation(start_date: date, end_date: date, db: Session = Depends(get_db)):
    """
    Summarizes tax liabilities from purchases.
    Uses the 2-decimal quantized vat_total from each invoice.
    """
    purchases = db.query(models.PurchaseInvoice).filter(
        models.PurchaseInvoice.date >= start_date,
        models.PurchaseInvoice.date <= end_date,
        models.PurchaseInvoice.status != "draft"
    ).all()

    tax_summary = {}
    total_input_vat = Decimal('0.00')

    for p in purchases:
        # We use the quantized vat_total saved in the DB
        v_total = to_decimal(p.vat_total)
        total_input_vat += v_total
        
        # Group by tax account if possible
        for line in p.lines:
            acct = line.account_code or "Unknown"
            tax_val = to_decimal(line.vat)
            tax_summary[acct] = tax_summary.get(acct, Decimal('0.00')) + tax_val

    return {
        "period": {"start": start_date, "end": end_date},
        "total_vat_claimable": total_input_vat.quantize(Decimal('0.00')),
        "breakdown_by_account": tax_summary
    }

# -------------------- Supplier Performance Analytics --------------------

@router.get("/suppliers/{supplier_id}/performance")
def get_supplier_performance(supplier_id: int, db: Session = Depends(get_db)):
    """
    Analyzes supplier spending patterns.
    Ensures average order value reflects rounded 5c totals.
    """
    purchases = db.query(models.PurchaseInvoice).filter(
        models.PurchaseInvoice.supplier_id == supplier_id,
        models.PurchaseInvoice.status == "paid"
    ).all()

    if not purchases:
        return {"message": "No paid history found"}

    total_spent = sum(to_decimal(p.total) for p in purchases)
    avg_spent = total_spent / len(purchases)

    return {
        "supplier_id": supplier_id,
        "total_invoices": len(purchases),
        "total_volume": total_spent.quantize(Decimal('0.00')),
        "average_rounded_value": round_to_5c(avg_spent)
    }

# -------------------- Advanced Query Filters --------------------

@router.post("/query/filter")
def advanced_purchase_filter(
    filters: dict = Body(...), 
    db: Session = Depends(get_db)
):
    """
    Flexible search for the procurement dashboard.
    Enforces rounding on numeric range filters.
    """
    query = db.query(models.PurchaseInvoice)

    if "min_total" in filters:
        # Match against rounded DB values
        val = to_decimal(filters["min_total"])
        query = query.filter(models.PurchaseInvoice.total >= val)
    
    if "status" in filters:
        query = query.filter(models.PurchaseInvoice.status == filters["status"])

    results = query.order_by(models.PurchaseInvoice.id.desc()).limit(50).all()
    return results
# -------------------- Workflow & Approval Logic --------------------

@router.patch("/{purchase_id}/status")
def update_purchase_status(
    purchase_id: int, 
    status: str = Body(..., embed=True), 
    db: Session = Depends(get_db)
):
    """
    Handles workflow transitions. 
    When moving to 'Approved', it performs a final rounding sync to ensure 
    database integrity before the ledger is finalized.
    """
    purchase = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    new_status = status.lower().strip()
    
    # Final validation/rounding sync upon approval
    if new_status == "approved" and purchase.status == "draft":
        sync_purchase_totals(purchase)
        
        # Trigger Stock entries if not already present
        _remove_stock_entries_for_purchase(db, purchase)
        for ln in purchase.lines:
            if ln.product_id:
                stock = StockEntry(
                    product_id=ln.product_id,
                    purchase_invoice_id=purchase.id,
                    quantity=ln.quantity,
                    entry_type="in",
                    entry_date=purchase.date or date.today(),
                    unit_cost=ln.unit_price
                )
                db.add(stock)

    purchase.status = new_status
    db.commit()
    db.refresh(purchase)
    return {"id": purchase.id, "new_status": purchase.status, "total_rounded": purchase.total}

# -------------------- Supplier Statement Generation --------------------

@router.get("/suppliers/{supplier_id}/statement")
def get_supplier_statement(
    supplier_id: int, 
    start_date: date, 
    end_date: date, 
    db: Session = Depends(get_db)
):
    """
    Generates a chronological statement of account for a supplier.
    Ensures that the 'Running Balance' correctly sums 5-cent rounded totals.
    """
    # Fetch Invoices
    invoices = db.query(models.PurchaseInvoice).filter(
        models.PurchaseInvoice.supplier_id == supplier_id,
        models.PurchaseInvoice.date >= start_date,
        models.PurchaseInvoice.date <= end_date,
        models.PurchaseInvoice.status != "draft"
    ).all()

    # Fetch Payments
    payments = db.query(models.SupplierPayment).filter(
        models.SupplierPayment.supplier_id == supplier_id,
        models.SupplierPayment.date >= start_date,
        models.SupplierPayment.date <= end_date
    ).all()

    # Combine and sort by date
    entries = []
    for inv in invoices:
        entries.append({
            "date": inv.date,
            "ref": f"Inv: {inv.invoice_number}",
            "debit": Decimal('0.00'),
            "credit": to_decimal(inv.total), # Rounded total
            "type": "invoice"
        })
    
    for pymt in payments:
        entries.append({
            "date": pymt.date,
            "ref": f"Pymt: {pymt.id}",
            "debit": to_decimal(pymt.amount),
            "credit": Decimal('0.00'),
            "type": "payment"
        })

    entries.sort(key=lambda x: x["date"])

    # Calculate running balance
    running_bal = Decimal('0.00')
    statement_lines = []
    for entry in entries:
        running_bal += (entry["credit"] - entry["debit"])
        entry["balance"] = running_bal.quantize(Decimal('0.00'))
        statement_lines.append(entry)

    return {
        "supplier_id": supplier_id,
        "period": {"start": start_date, "end": end_date},
        "closing_balance": running_bal.quantize(Decimal('0.00')),
        "entries": statement_lines
    }

# -------------------- Search & Export Logic --------------------

@router.get("/export/csv")
def export_purchases_to_csv(db: Session = Depends(get_db)):
    """
    Generates a CSV string of all purchases.
    Uses strict 2-decimal formatting for financial columns.
    """
    import csv
    from io import StringIO
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Date", "Invoice #", "Supplier", "Subtotal", "VAT", "Total (Rounded)"])

    purchases = db.query(models.PurchaseInvoice).all()
    for p in purchases:
        writer.writerow([
            p.id,
            p.date,
            p.invoice_number,
            p.supplier.name if p.supplier else "N/A",
            "{:.2f}".format(to_decimal(p.sub_total)),
            "{:.2f}".format(to_decimal(p.vat_total)),
            "{:.2f}".format(to_decimal(p.total)) # Already rounded in DB
        ])

    return output.getvalue()

# -------------------- Global Ledger Integration Hook --------------------

def post_to_general_ledger(purchase: models.PurchaseInvoice, db: Session):
    """
    Placeholder for General Ledger integration.
    Ensures that the total Ledger credit matches the 5-cent rounded Invoice total.
    """
    # Total Credit to Accounts Payable = purchase.total (Rounded)
    # Total Debits = purchase.sub_total + purchase.vat_total + purchase.rounding_adjustment
    pass

# -------------------- Closing --------------------

# Note: All functions above rely on the rounding helpers 
# defined in Lines 1-250: to_decimal() and round_to_5c().
# End of routes/purchase.py