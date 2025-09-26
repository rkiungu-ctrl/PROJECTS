# routes/purchase.py
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from datetime import datetime, date, timedelta
import sqlite3

from database import get_db
import models # not "import model as models"
from models.payment import SupplierPayment
from models.payment_line import PaymentLine  # Add this import at the top

from schemas.purchase_invoice import (
    PurchaseInvoiceCreate,
    PurchaseInvoiceUpdate,
    PurchaseInvoiceOut,
    PurchaseInvoiceLineUpdate,
)


router = APIRouter()

# -------------------- Helpers --------------------

def parse_date(val):
    """Return a python date or None. Accepts date, datetime, 'YYYY-MM-DD', 'DD/MM/YYYY'."""
    if not val:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return datetime.strptime(val, "%Y-%m-%d").date()
        except ValueError:
            try:
                return datetime.strptime(val, "%d/%m/%Y").date()
            except ValueError:
                return None
    return None

def to_ymd(val):
    if not val:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, str):
        d = parse_date(val)
        return d.strftime("%Y-%m-%d") if d else val
    return ""


def get_tax_options(db: Session):
    """
    Returns normalized tax dicts:
    { id, account_code, type, rate, start_date, end_date, code, label }
    """
    taxes = db.query(models.Tax).all()
    tax_options = []
    for t in taxes:
        tax_options.append({
            "id": t.id,
            "account_code": t.account_code or "",
            "type": (t.type or "").upper(),
            "rate": float(t.rate or 0),
            "start_date": t.start_date,
            "end_date": t.end_date,
            "code": t.account_code or "",
            "label": f"{t.type} {int(float(t.rate or 0) * 100)}%"
        })
    return tax_options


def get_tax_label(tax_options, type_name, code_or_label):
    """Return a nice label like 'VAT 16%' for the given type/code; fallback to the raw code."""
    if not code_or_label:
        return None
    t_upper = (type_name or "").upper()
    val = str(code_or_label)
    for t in tax_options:
        if (t.get("type") or "").upper() != t_upper:
            continue
        if (
            str(t.get("code")) == val
            or str(t.get("label")) == val
            or str(t.get("account_code")) == val
            or str(t.get("id")) == val
        ):
            return t.get("label") or val
    return val


def find_rate(tax_options, type_name, code_or_label):
    """Find rate by matching type and code/label/account_code/id."""
    if not code_or_label:
        return 0.0
    t_upper = (type_name or "").upper()
    val = str(code_or_label)
    for t in tax_options:
        if (t.get("type") or "").upper() != t_upper:
            continue
        if (
            str(t.get("code")) == val
            or str(t.get("label")) == val
            or str(t.get("account_code")) == val
            or str(t.get("id")) == val
        ):
            try:
                return float(t.get("rate") or 0)
            except Exception:
                return 0.0
    return 0.0


def calculate_invoice_total(lines, tax_options):
    total = 0.0
    for ln in lines:
        quantity = float(getattr(ln, "quantity", 0) or 0)
        unit_price = float(getattr(ln, "unit_price", 0) or 0)
        base = quantity * unit_price

        excise_amount = 0.0
        excise_code = getattr(ln, "excise_code", None)
        if excise_code:
            excise_rate = find_rate(tax_options, "EXCISE", excise_code)
            if excise_rate > 0:
                excise_amount = base * excise_rate

        vat_amount = 0.0
        vat_code = getattr(ln, "vat_code", None)
        if vat_code:
            vat_rate = find_rate(tax_options, "VAT", vat_code)
            if vat_rate > 0:
                vat_amount = (base + excise_amount) * vat_rate

        if getattr(ln, "type", "") == "Discount":
            total -= base
        else:
            line_total = base
            if excise_amount:
                line_total += excise_amount
            if vat_amount:
                line_total += vat_amount
            total += line_total
    return total


def compute_breakdown(lines, tax_options):
    subtotal = excise_total = vat_total = 0.0
    for ln in lines:
        qty = float(getattr(ln, "quantity", 0) or 0)
        price = float(getattr(ln, "unit_price", 0) or 0)
        base = qty * price
        if getattr(ln, "type", "") == "Discount":
            base = -base

        excise_rate = find_rate(tax_options, "EXCISE", getattr(ln, "excise_code", None))
        excise = base * excise_rate

        vat_rate = find_rate(tax_options, "VAT", getattr(ln, "vat_code", None))
        vat = (base + excise) * vat_rate

        subtotal += base
        excise_total += excise
        vat_total += vat

    total = subtotal + excise_total + vat_total
    return {
        "subtotal": round(subtotal, 2),
        "excise": round(excise_total, 2),
        "vat": round(vat_total, 2),
        "total": round(total, 2),
    }


# -------------------- Put STATIC route BEFORE any /purchases/{id} --------------------

@router.get("/purchases/pending_recurring")
def get_pending_recurring(db: Session = Depends(get_db)):
    today = date.today()
    suppliers = {s.id: s.name for s in db.query(models.Supplier).all()}
    tax_opts = get_tax_options(db)
    result = []

    recurring_invoices = (
        db.query(models.PurchaseInvoice)
        .filter(
            models.PurchaseInvoice.is_recurring.in_([1, True]),
            models.PurchaseInvoice.recurrence_interval.isnot(None)
        )
        .all()
    )

    print("Recurring invoices found:", recurring_invoices)

    for inv in recurring_invoices:
        if not inv.invoice_date:
            continue

        # Start from next_issue_date if present, else invoice_date
        start_date = inv.next_issue_date or inv.invoice_date
        next_date_obj = parse_date(start_date)
        recurrence_end = parse_date(inv.recurrence_end_date) if inv.recurrence_end_date else None

        # Determine interval type and value
        interval_str = str(inv.recurrence_interval or "").lower()
        if "month" in interval_str:
            interval_type = "monthly"
            interval_value = 1
            try:
                interval_value = int(interval_str.split()[0])
            except Exception:
                pass
        elif "week" in interval_str:
            interval_type = "weekly"
            interval_value = 1
            try:
                interval_value = int(interval_str.split()[0])
            except Exception:
                pass
        else:
            interval_type = "monthly"
            interval_value = 1

        # Find the next due interval (not in future, not already created)
        while next_date_obj <= today:
            if recurrence_end and next_date_obj > recurrence_end:
                break

            exists = db.query(models.PurchaseInvoice).filter(
                models.PurchaseInvoice.supplier_id == inv.supplier_id,
                models.PurchaseInvoice.invoice_date == next_date_obj,
                models.PurchaseInvoice.id != inv.id
            ).first()
            if not exists:
                tpl_lines = db.query(models.PurchaseInvoiceLine).filter(
                    models.PurchaseInvoiceLine.purchase_invoice_id == inv.id
                ).all()

                subtotal = calculate_invoice_total(tpl_lines, tax_opts)

                norm_lines = []
                for ln in tpl_lines:
                    taxes = []
                    vat_label = get_tax_label(tax_opts, "VAT", ln.vat_code)
                    if vat_label:
                        taxes.append(vat_label)
                    excise_label = get_tax_label(tax_opts, "EXCISE", ln.excise_code)
                    if excise_label:
                        taxes.append(excise_label)

                    norm_lines.append({
                        "type": ln.type,
                        "product_id": ln.product_id,
                        "item": ln.item,
                        "description": ln.description,
                        "quantity": float(ln.quantity or 0),
                        "unit_price": float(ln.unit_price or 0),
                        "vat_code": ln.vat_code,
                        "excise_code": ln.excise_code,
                        "account_code": ln.account_code,
                        "taxes": taxes,
                    })

                result.append({
                    "template_id": inv.id,
                    "next_issue_date": next_date_obj.strftime("%Y-%m-%d"),
                    "supplier_name": suppliers.get(inv.supplier_id, ""),
                    "description": getattr(inv, "description", "") or "",
                    "amount": float(
                        subtotal if subtotal is not None else (
                            getattr(inv, "total_amount", 0) or getattr(inv, "amount", 0) or 0
                        )
                    ),
                    "lines": norm_lines,
                })
                break  # Only show the next pending one

            # Advance to next interval (same day next month)
            if interval_type == "monthly":
                month = next_date_obj.month + interval_value
                year = next_date_obj.year + (month - 1) // 12
                month = (month - 1) % 12 + 1
                day = min(next_date_obj.day, 28)  # Avoid issues with Feb
                next_date_obj = date(year, month, day)
            elif interval_type == "weekly":
                next_date_obj = next_date_obj + timedelta(days=7 * interval_value)
            else:
                next_date_obj = next_date_obj + timedelta(days=30 * interval_value)

    print("Result:", result)
    return result


# -------------------- Other Endpoints --------------------

@router.get("/purchases/")
def list_purchases(
    q: str | None = None,
    supplier_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.PurchaseInvoice)
        .options(joinedload(models.PurchaseInvoice.lines))
        .join(models.Supplier, isouter=True)
    )
    if supplier_id is not None:
        query = query.filter(models.PurchaseInvoice.supplier_id == supplier_id)
    if date_from:
        query = query.filter(models.PurchaseInvoice.invoice_date >= date_from)
    if date_to:
        query = query.filter(models.PurchaseInvoice.invoice_date <= date_to)
    # text search unchanged...
    if q:
        like = f"%{q}%"
        filters = []
        if hasattr(models.PurchaseInvoice, "reference"):
            filters.append(models.PurchaseInvoice.reference.ilike(like))
        if hasattr(models.PurchaseInvoice, "description"):
            filters.append(models.PurchaseInvoice.description.ilike(like))
        if hasattr(models.PurchaseInvoice, "recurrence_interval"):
            filters.append(models.PurchaseInvoice.recurrence_interval.ilike(like))
        filters.append(models.Supplier.name.ilike(like))
        if filters:
            query = query.filter(or_(*filters))

    invoices = query.all()

    suppliers = {s.id: s.name for s in db.query(models.Supplier).all()}
    tax_opts = get_tax_options(db)

    result = []
    for inv in invoices:
        lines = getattr(inv, "lines", []) or []
        if lines:
            display_total = calculate_invoice_total(lines, tax_opts)  # tax-inclusive
        else:
            display_total = float(inv.total_amount or 0.0)            # fallback

        amount_paid = float(getattr(inv, "amount_paid", 0) or 0)
        balance_due = round(display_total - amount_paid, 2)

        result.append({
            "id": inv.id,
            "supplier_id": inv.supplier_id,
            "supplier_name": suppliers.get(inv.supplier_id, ""),
            "invoice_date": to_ymd(inv.invoice_date),
            "reference": getattr(inv, "reference", None),
            "status": getattr(inv, "status", None),
            "total": round(display_total, 2),
            "balance_due": balance_due,
            "currency_code": getattr(inv, "currency_code", "KES"),
            "cu_inv_number": getattr(inv, "cu_inv_number", None),
            "amount_paid": amount_paid,
            "recurrence_interval": getattr(inv, "recurrence_interval", ""),
            "description": getattr(inv, "description", ""),
            "lines": [
                {
                    "type": getattr(ln, "type", None),
                    "item": getattr(ln, "item", None),
                    "description": getattr(ln, "description", None),
                    "quantity": getattr(ln, "quantity", None),
                    "unit_price": getattr(ln, "unit_price", None),
                    "vat_code": getattr(ln, "vat_code", None),
                    "excise_code": getattr(ln, "excise_code", None),
                    "account_code": getattr(ln, "account_code", None),
                }
                for ln in lines
            ],
        })
    return result


@router.post("/purchases/{id}/post")
def post_purchase(id: int, db: Session = Depends(get_db)):
    purchase = db.query(models.PurchaseInvoice).filter_by(id=id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    purchase.status = "Posted"
    db.commit()
    return {"success": True, "status": purchase.status}


@router.delete("/purchases/{id}/delete")
def delete_purchase(id: int, db: Session = Depends(get_db)):
    purchase = db.query(models.PurchaseInvoice).filter_by(id=id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    db.delete(purchase)
    db.commit()
    return {"success": True}


@router.get("/purchases/{id}")
def get_purchase(id: int, db: Session = Depends(get_db)):
    purchase = (
        db.query(models.PurchaseInvoice)
        .options(joinedload(models.PurchaseInvoice.lines))
        .filter_by(id=id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    supplier = db.query(models.Supplier).filter_by(id=purchase.supplier_id).first()

    tax_opts = get_tax_options(db)
    br = compute_breakdown(purchase.lines or [], tax_opts)

    curr = getattr(purchase, "currency_code", "KES") or "KES"
    rate = float(getattr(purchase, "exchange_rate", 1.0) or 1.0)
    base_curr = "KES"

    totals = {
        "currency": curr,
        "exchange_rate": rate,
        "doc": br,  # subtotal/excise/vat/total in document currency
        "base_currency": base_curr,
        "base": {
            "subtotal": round(br["subtotal"] * rate, 2),
            "excise": round(br["excise"] * rate, 2),
            "vat": round(br["vat"] * rate, 2),
            "total": round(br["total"] * rate, 2),
        },
    }

    return {
        "id": purchase.id,
        "invoice_date": to_ymd(purchase.invoice_date),
        "supplier_id": purchase.supplier_id,
        "supplier_name": supplier.name if supplier else "",
        "reference": purchase.reference,
        "total": purchase.total_amount,
        "amount_paid": getattr(purchase, "amount_paid", 0),
        "balance_due": (purchase.total_amount or 0) - (getattr(purchase, "amount_paid", 0) or 0),
        "status": purchase.status,
        "currency_code": curr,
        "exchange_rate": rate,
        "cu_inv_number": getattr(purchase, "cu_inv_number", None),
        "lines": [
            {
                "id": line.id,
                "type": line.type,
                "product_id": line.product_id,
                "item": line.item,
                "account_code": line.account_code,
                "description": line.description,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "vat_code": line.vat_code,
                "excise_code": line.excise_code,
            }
            for line in purchase.lines
        ],
        "is_recurring": getattr(purchase, "is_recurring", False),
        "recurrence_interval": getattr(purchase, "recurrence_interval", ""),
        "recurrence_end_date": to_ymd(purchase.recurrence_end_date),
        "totals": totals,  # <
    }


@router.post("/purchases/")
def create_purchase(invoice: PurchaseInvoiceCreate, db: Session = Depends(get_db)):
    code = (invoice.currency_code or "KES").split()[0].upper()
    rate = float(invoice.exchange_rate or 1.0)

    db_invoice = models.PurchaseInvoice(
        invoice_date=parse_date(invoice.invoice_date),
        supplier_id=invoice.supplier_id,
        reference=invoice.reference or None,
        status="Draft",
        is_recurring=invoice.is_recurring,
        recurrence_interval=invoice.recurrence_interval,
        recurrence_end_date=parse_date(invoice.recurrence_end_date),
        currency_code=code,
        exchange_rate=rate,
        cu_inv_number=invoice.cu_inv_number,
    )
    db.add(db_invoice)
    db.flush()  # get id

    # if lines were sent, insert them
    if invoice.lines:
        for ln in invoice.lines:
            db.add(models.PurchaseInvoiceLine(
                purchase_invoice_id=db_invoice.id,
                type=ln.type,
                product_id=ln.product_id,
                item=ln.item,
                account_code=getattr(ln, "account_code", None),
                description=getattr(ln, "description", None),
                quantity=float(ln.quantity or 0),
                unit_price=float(ln.unit_price or 0),
                vat_code=getattr(ln, "vat_code", None),
                excise_code=getattr(ln, "excise_code", None),
            ))
        db.flush()

        # recalc total with taxes
        tax_options = get_tax_options(db)
        lines = db.query(models.PurchaseInvoiceLine).filter_by(purchase_invoice_id=db_invoice.id).all()
        db_invoice.total_amount = calculate_invoice_total(lines, tax_options)

    db.commit()
    db.refresh(db_invoice)
    return {"id": db_invoice.id, "success": True}


# ✅ Single, typed update endpoint (remove all other duplicates)
@router.put("/purchases/{id}/edit")
def update_purchase(id: int, invoice: PurchaseInvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.query(models.PurchaseInvoice).filter_by(id=id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # header fields (only if provided)
    if invoice.invoice_date is not None:
        inv.invoice_date = parse_date(invoice.invoice_date)
    if invoice.recurrence_end_date is not None:
        inv.recurrence_end_date = parse_date(invoice.recurrence_end_date)
    if invoice.supplier_id is not None:
        inv.supplier_id = invoice.supplier_id
    if invoice.invoice_number is not None:
        inv.invoice_number = invoice.invoice_number
    if invoice.reference is not None:
        inv.reference = invoice.reference
    if invoice.narration is not None:
        inv.narration = invoice.narration

    # currency & CU invoice number
    if invoice.currency_code is not None:
        code = str(invoice.currency_code).split()[0]  # take first token if string like "USD United States dollar"
        inv.currency_code = code.upper() or None

    # accept 'exchange_rate' if sent
    if getattr(invoice, "exchange_rate", None) is not None:
        try:
            inv.exchange_rate = float(invoice.exchange_rate)  # store as float
        except Exception:
            inv.exchange_rate = None  # or leave unchanged

    if invoice.cu_inv_number is not None:
        inv.cu_inv_number = invoice.cu_inv_number

    # Ensure next_issue_date is always set for recurring invoices
    if invoice.is_recurring is not None:
        inv.is_recurring = invoice.is_recurring
    if invoice.recurrence_interval is not None:
        inv.recurrence_interval = invoice.recurrence_interval

    # Always set next_issue_date for recurring invoices
    if getattr(invoice, "next_issue_date", None) is not None:
        inv.next_issue_date = parse_date(invoice.next_issue_date)
    elif inv.is_recurring and not inv.next_issue_date:
        # Default to invoice_date if missing
        inv.next_issue_date = parse_date(inv.invoice_date)

    # replace lines if provided
    if invoice.lines is not None:
        # Get existing lines from DB
        existing_lines = db.query(models.PurchaseInvoiceLine).filter_by(purchase_invoice_id=id).all()
        existing_line_ids = {ln.id for ln in existing_lines}
        payload_line_ids = {getattr(ln, 'id', None) for ln in invoice.lines if getattr(ln, 'id', None) is not None}

        # Update or insert lines
        for line in invoice.lines:
            line_id = getattr(line, 'id', None)
            if line_id and line_id in existing_line_ids:
                # Update existing line
                db_line = db.query(models.PurchaseInvoiceLine).filter_by(id=line_id).first()
                db_line.type = line.type
                db_line.product_id = line.product_id
                db_line.item = line.item
                db_line.account_code = getattr(line, "account_code", None)
                db_line.description = getattr(line, "description", None)
                db_line.quantity = float(line.quantity or 0)
                db_line.unit_price = float(line.unit_price or 0)
                db_line.vat_code = getattr(line, "vat_code", None)
                db_line.excise_code = getattr(line, "excise_code", None)
            else:
                # Insert new line
                db.add(models.PurchaseInvoiceLine(
                    purchase_invoice_id=id,
                    type=line.type,
                    product_id=line.product_id,
                    item=line.item,
                    account_code=getattr(line, "account_code", None),
                    description=getattr(line, "description", None),
                    quantity=float(line.quantity or 0),
                    unit_price=float(line.unit_price or 0),
                    vat_code=getattr(line, "vat_code", None),
                    excise_code=getattr(line, "excise_code", None),
                ))

        # Delete lines that are in DB but not in payload
        lines_to_delete = [ln for ln in existing_lines if ln.id not in payload_line_ids]
        for ln in lines_to_delete:
            db.delete(ln)
        db.flush()

    # recalc total
    tax_options = get_tax_options(db)
    lines = db.query(models.PurchaseInvoiceLine).filter_by(purchase_invoice_id=id).all()
    inv.total_amount = calculate_invoice_total(lines, tax_options)
    db.commit()
    db.refresh(inv)
    return {"success": True}


@router.get("/taxes/")
def list_taxes(db: Session = Depends(get_db)):
    return get_tax_options(db)


@router.post("/purchases/grossup_missing_lines")
def grossup_missing_lines(db: Session = Depends(get_db)):
    DEFAULTS = {
        "Safaricom PLC": {"vat": 0.16, "excise": 0.15},
        "Airtel Networks (K) Ltd": {"vat": 0.16, "excise": 0.15},
    }

    updated = 0
    invoices = db.query(models.PurchaseInvoice).options(
        joinedload(models.PurchaseInvoice.lines)
    ).all()

    suppliers = {s.id: s.name for s in db.query(models.Supplier).all()}

    for inv in invoices:
        if getattr(inv, "lines", None):
            continue

        name = suppliers.get(inv.supplier_id, "")
        defaults = DEFAULTS.get(name)
        if not defaults:
            continue

        base = float(inv.total_amount or 0)
        vat = float(defaults["vat"])
        exc = float(defaults["excise"])
        inclusive = round(base * (1 + exc) * (1 + vat), 2)

        inv.total_amount = inclusive
        updated += 1

    db.commit()
    return {"updated": updated}


@router.get("/purchase_invoices/")
def get_purchase_invoices(supplier_id: int = None, db: Session = Depends(get_db)):
    query = db.query(models.PurchaseInvoice)
    if supplier_id:
        query = query.filter(models.PurchaseInvoice.supplier_id == supplier_id)
    return query.all()


def update_invoice_status(db: Session, invoice_id: int):
    invoice = db.query(models.PurchaseInvoice).filter_by(id=invoice_id).first()
    if not invoice:
        return
    total_paid = db.query(func.coalesce(func.sum(SupplierPayment.amount), 0.0)).filter(
        SupplierPayment.purchase_invoice_id == invoice_id
    ).scalar() or 0.0

    if total_paid == 0:
        invoice.status = "Posted"
    elif total_paid < (invoice.total_amount or 0):  # <-- use total_amount
        invoice.status = "Partially Paid"
    else:
        invoice.status = "PAID"
    db.commit()


@router.post("/purchases/batch_create_recurring")
def batch_create_recurring(pending_list: list = Body(...), db: Session = Depends(get_db)):
    created = 0
    for item in pending_list:
        template_id = item.get("template_id")
        next_date = parse_date(item.get("next_issue_date"))
        inv = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.id == template_id).first()
        if not inv or not next_date or not inv.is_recurring or not inv.recurrence_interval:
            continue

        exists = db.query(models.PurchaseInvoice).filter(
            models.PurchaseInvoice.supplier_id == inv.supplier_id,
            models.PurchaseInvoice.invoice_date == next_date,
            models.PurchaseInvoice.id != inv.id
        ).first()
        if exists:
            continue

        new_inv = models.PurchaseInvoice(
            supplier_id=inv.supplier_id,
            invoice_date=next_date,
            status="Draft",
            is_recurring=False,
            recurrence_interval=None,
            recurrence_end_date=None,
            total_amount=0.0,
            reference=None,
            currency_code=getattr(inv, "currency_code", "KES"),
            exchange_rate=float(getattr(inv, "exchange_rate", 1.0) or 1.0),
            cu_inv_number=getattr(inv, "cu_inv_number", None),
        )
        db.add(new_inv)
        db.flush()

        lines = db.query(models.PurchaseInvoiceLine).filter(
            models.PurchaseInvoiceLine.purchase_invoice_id == inv.id
        ).all()
        for line in lines:
            new_line = models.PurchaseInvoiceLine(
                purchase_invoice_id=new_inv.id,
                type=getattr(line, "type", None),
                product_id=getattr(line, "product_id", None),
                item=getattr(line, "item", None),
                account_code=getattr(line, "account_code", None),
                description=getattr(line, "description", None),
                quantity=getattr(line, "quantity", 0),
                unit_price=getattr(line, "unit_price", 0),
                vat_code=getattr(line, "vat_code", None),
                excise_code=getattr(line, "excise_code", None),
            )
            db.add(new_line)
        db.commit()
        created += 1

    return {"created": created}


# --- PATCH: Fix /purchases/{invoice_id}/copy to recalculate total after copying lines ---
@router.post("/purchases/{invoice_id}/copy")
def copy_purchase_invoice(invoice_id: int, db: Session = Depends(get_db)):
    original = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.id == invoice_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Invoice not found")

    new_invoice = models.PurchaseInvoice(
        supplier_id=original.supplier_id,
        invoice_date=date.today(),
        status="Draft",
        is_recurring=original.is_recurring,
        recurrence_interval=original.recurrence_interval,
        recurrence_end_date=original.recurrence_end_date,
        total_amount=0.0,  # will be recalculated
        reference=None,
        currency_code=getattr(original, "currency_code", "KES"),
        exchange_rate=float(getattr(original, "exchange_rate", 1.0) or 1.0),
        cu_inv_number=getattr(original, "cu_inv_number", None),
    )
    db.add(new_invoice)
    db.flush()

    new_invoice.reference = f"B1-{new_invoice.id:06d}"
    db.commit()

    lines = db.query(models.PurchaseInvoiceLine).filter(
        models.PurchaseInvoiceLine.purchase_invoice_id == original.id
    ).all()
    for line in lines:
        db.add(models.PurchaseInvoiceLine(
            purchase_invoice_id=new_invoice.id,
            type=getattr(line, "type", None),
            product_id=getattr(line, "product_id", None),
            item=getattr(line, "item", None),
            account_code=getattr(line, "account_code", None),
            description=getattr(line, "description", None),
            quantity=getattr(line, "quantity", 0),
            unit_price=getattr(line, "unit_price", 0),
            vat_code=getattr(line, "vat_code", None),
            excise_code=getattr(line, "excise_code", None),
        ))
    db.flush()
    # Recalculate total for the new invoice
    tax_options = get_tax_options(db)
    new_lines = db.query(models.PurchaseInvoiceLine).filter(
        models.PurchaseInvoiceLine.purchase_invoice_id == new_invoice.id
    ).all()
    new_invoice.total_amount = calculate_invoice_total(new_lines, tax_options)
    db.commit()
    return {"new_invoice_id": new_invoice.id}


@router.post("/purchases/batch_delete")
def batch_delete(ids: list = Body(...), db: Session = Depends(get_db)):
    deleted = 0
    for invoice_id in ids:
        inv = db.query(models.PurchaseInvoice).filter_by(id=invoice_id).first()
        # Only delete if it's a template (is_recurring True/1)
        if inv and (inv.is_recurring == 1 or inv.is_recurring is True):
            db.delete(inv)
            deleted += 1
    db.commit()
    return {"deleted": deleted}


