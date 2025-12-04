# routes/purchase.py
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import date, timedelta, datetime

from database import get_db
import models
from models.purchase_invoice import PurchaseInvoice
from models.stock_entry import StockEntry
from schemas.purchase_invoice import (
    PurchaseInvoiceCreate,
    PurchaseInvoiceUpdate,
    PurchaseInvoiceOut,
)

router = APIRouter(prefix="/purchases", tags=["Purchases"])

# -------------------- Helpers --------------------

def parse_date(date_str):
    if isinstance(date_str, date):
        return date_str
    if not date_str:
        return None
    return datetime.strptime(str(date_str), "%Y-%m-%d").date()

def get_tax_options(db: Session):
    Tax = models.Tax
    taxes = db.query(Tax).all()
    out = []
    for t in taxes:
        out.append({
            "id": t.id,
            "code": str(getattr(t, "code", t.id)),
            "type": (getattr(t, "type", None) or getattr(t, "tax_type", None) or "").upper(),
            "rate": float(getattr(t, "rate", 0) or 0),
        })
    return out

def _find_rate(options, code, tax_type):
    if not code:
        return 0.0
    ttype = (tax_type or "").upper()
    for t in options:
        if (t["type"] or "").upper() == ttype and (str(t["id"]) == str(code) or t["code"] == code):
            return float(t["rate"] or 0)
    return 0.0

def compute_breakdown(lines, tax_options):
    sub_total = 0.0
    excise_total = 0.0
    vat_total = 0.0

    for ln in (lines or []):
        qty = float(getattr(ln, "quantity", 0) or 0)
        price = float(getattr(ln, "unit_price", 0) or 0)
        base = qty * price
        sub_total += base

        exc_rate = _find_rate(tax_options, getattr(ln, "excise_code", None), "EXCISE")
        exc_amt = base * exc_rate
        excise_total += exc_amt

        vat_rate = _find_rate(tax_options, getattr(ln, "vat_code", None), "VAT")
        vat_total += (base + exc_amt) * vat_rate

    total = sub_total + excise_total + vat_total
    return {"sub_total": sub_total, "excise": excise_total, "vat": vat_total, "total": total}

def calculate_invoice_total(lines, tax_options):
    br = compute_breakdown(lines, tax_options)
    return br["total"]

def _remove_stock_entries_for_purchase(db: Session, purchase: models.PurchaseInvoice):
    try:
        db.query(StockEntry).filter(StockEntry.purchase_invoice_id == purchase.id).delete()
    except Exception:
        pass

def _rebuild_stock_entries_for_purchase(db: Session, purchase: models.PurchaseInvoice):
    _remove_stock_entries_for_purchase(db, purchase)
    lines = db.query(models.PurchaseInvoiceLine).filter_by(purchase_invoice_id=purchase.id).all()
    for ln in lines:
        if ln is None:
            continue
        if ln.type == "Product" and ln.product_id:
            db.add(StockEntry(
                product_id=ln.product_id,
                quantity=float(ln.quantity or 0),
                type="IN",
                date=purchase.invoice_date,
                reference=purchase.reference or f"Purchase {purchase.id}",
                purchase_invoice_id=purchase.id,
            ))
    db.flush()

def get_next_occurrence(current_date, day_of_month):
    year = current_date.year
    month = current_date.month
    if current_date.day >= day_of_month:
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1
    try:
        return date(year, month, day_of_month)
    except ValueError:
        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        return next_month - timedelta(days=1)

# -------------------- List / Static routes FIRST --------------------

@router.get("/purchase_invoices/")
def legacy_list_purchase_invoices(db: Session = Depends(get_db)):
    return db.query(models.PurchaseInvoice).all()

@router.get("/purchase-invoices")
def list_purchase_invoices(db: Session = Depends(get_db)):
    purchases = (
        db.query(models.PurchaseInvoice)
        .options(joinedload(models.PurchaseInvoice.lines))
        .all()
    )
    supplier_ids = [p.supplier_id for p in purchases if p.supplier_id]
    suppliers = {s.id: s.name for s in db.query(models.Supplier).filter(models.Supplier.id.in_(supplier_ids)).all()}
    out = []
    # PurchasePayment model does not exist, so skip payment aggregation
    for p in purchases:
        data = PurchaseInvoiceOut.from_orm(p).dict()
        data["supplier_name"] = suppliers.get(p.supplier_id, "")
        data["amount_paid"] = getattr(p, "amount_paid", 0)
        data["balance_due"] = (p.total_amount or 0) - data["amount_paid"]
        out.append(data)
    return out

@router.get("/pending_recurring", response_model=list[PurchaseInvoiceOut])
def get_pending_recurring(db: Session = Depends(get_db)):
    # You can refine the filter as needed
    return db.query(PurchaseInvoice).filter(PurchaseInvoice.is_recurring == True).all()

@router.get("/taxes/")
def get_taxes(db: Session = Depends(get_db)):
    return get_tax_options(db)

# -------------------- Detail / Mutations --------------------

@router.get("/{id}")
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

    def to_ymd(d):
        if isinstance(d, (date, datetime)):
            return d.strftime("%Y-%m-%d")
        try:
            return datetime.strptime(str(d), "%Y-%m-%d").date().strftime("%Y-%m-%d")
        except Exception:
            return str(d) if d else None

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
            for line in (purchase.lines or [])
        ],
        "breakdown": {
            "currency": curr,
            "base_currency": base_curr,
            "sub_total": round(br["sub_total"] * rate, 2),
            "excise": round(br["excise"] * rate, 2),
            "vat": round(br["vat"] * rate, 2),
            "total": round(br["total"] * rate, 2),
        },
    }

@router.post("/")
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
        total_amount=0.0,
    )
    db.add(db_invoice)
    db.flush()

    print(f"[DEBUG] Creating purchase invoice: {db_invoice}")
    print(f"[DEBUG] Incoming lines: {invoice.lines}")

    # lines
    for ln in (invoice.lines or []):
        line_type = ln.type or ("Product" if ln.product_id else "Service")
        item_val = ln.item or (str(ln.product_id) if ln.product_id else None)
        if ln.product_id and not ln.item:
            product = db.query(models.Product).filter_by(id=ln.product_id).first()
            if product:
                item_val = product.sku or product.name
        print(f"[DEBUG] Adding line: product_id={ln.product_id}, type={line_type}, item={item_val}, quantity={ln.quantity}, unit_price={ln.unit_price}")
        db.add(models.PurchaseInvoiceLine(
            purchase_invoice_id=db_invoice.id,
            type=line_type,
            product_id=ln.product_id,
            item=item_val,
            account_code=getattr(ln, "account_code", None),
            description=getattr(ln, "description", None),
            quantity=float(ln.quantity or 0),
            unit_price=float(ln.unit_price or 0),
            vat_code=getattr(ln, "vat_code", None),
            excise_code=getattr(ln, "excise_code", None),
        ))
        if line_type == "Product" and ln.product_id:
            db.add(StockEntry(
                product_id=ln.product_id,
                quantity=float(ln.quantity or 0),
                type="IN",
                date=parse_date(invoice.invoice_date),
                reference=db_invoice.reference or f"Purchase {db_invoice.id}",
                purchase_invoice_id=db_invoice.id,
            ))

    tax_options = get_tax_options(db)
    lines = db.query(models.PurchaseInvoiceLine).filter_by(purchase_invoice_id=db_invoice.id).all()
    db_invoice.total_amount = calculate_invoice_total(lines, tax_options)
    db.commit()
    db.refresh(db_invoice)
    return {"id": db_invoice.id}

@router.put("/{id}/edit")
def update_purchase(id: int, invoice: PurchaseInvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.query(models.PurchaseInvoice).filter_by(id=id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")

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

    if invoice.currency_code is not None:
        code = str(invoice.currency_code).split()[0]
        inv.currency_code = code.upper() or None
    if getattr(invoice, "exchange_rate", None) is not None:
        try:
            inv.exchange_rate = float(invoice.exchange_rate)
        except Exception:
            inv.exchange_rate = None
    if invoice.cu_inv_number is not None:
        inv.cu_inv_number = invoice.cu_inv_number

    if invoice.is_recurring is not None:
        inv.is_recurring = invoice.is_recurring
    if invoice.recurrence_interval is not None:
        inv.recurrence_interval = invoice.recurrence_interval
    if getattr(invoice, "next_issue_date", None) is not None:
        inv.next_issue_date = parse_date(invoice.next_issue_date)


    # lines
    if invoice.lines is not None:
        print(f"[DEBUG] Update: Incoming lines: {invoice.lines}")
        existing_lines = db.query(models.PurchaseInvoiceLine).filter_by(purchase_invoice_id=id).all()
        existing_by_id = {ln.id: ln for ln in existing_lines if ln is not None}
        payload_line_ids = []

        for line in invoice.lines:
            print(f"[DEBUG] Processing line: {line}")
            if getattr(line, "id", None) and line.id in existing_by_id:
                ln = existing_by_id[line.id]
                ln.type = line.type or ("Product" if line.product_id else "Service")
                ln.product_id = line.product_id
                ln.item = line.item
                ln.account_code = getattr(line, "account_code", None)
                ln.description = getattr(line, "description", None)
                ln.quantity = float(line.quantity or 0)
                ln.unit_price = float(line.unit_price or 0)
                ln.vat_code = getattr(line, "vat_code", None)
                ln.excise_code = getattr(line, "excise_code", None)
                payload_line_ids.append(ln.id)
            else:
                print(f"[DEBUG] Adding new line: product_id={line.product_id}, type={line.type}, item={line.item}, quantity={line.quantity}, unit_price={line.unit_price}")
                db.add(models.PurchaseInvoiceLine(
                    purchase_invoice_id=id,
                    type=line.type or ("Product" if line.product_id else "Service"),
                    product_id=line.product_id,
                    item=line.item,
                    account_code=getattr(line, "account_code", None),
                    description=getattr(line, "description", None),
                    quantity=float(line.quantity or 0),
                    unit_price=float(line.unit_price or 0),
                    vat_code=getattr(line, "vat_code", None),
                    excise_code=getattr(line, "excise_code", None),
                ))

        for ln in existing_lines:
            if ln is None:
                continue
            if ln.id not in payload_line_ids:
                print(f"[DEBUG] Deleting line id: {ln.id}")
                db.delete(ln)
        db.flush()
        _rebuild_stock_entries_for_purchase(db, inv)

    tax_options = get_tax_options(db)
    lines = db.query(models.PurchaseInvoiceLine).filter_by(purchase_invoice_id=id).all()
    inv.total_amount = calculate_invoice_total(lines, tax_options)
    db.commit()
    db.refresh(inv)
    return {"success": True}

# -------------------- Utilities / Batch --------------------

@router.post("/grossup_missing_lines")
def grossup_missing_lines(payload: dict = Body(None), db: Session = Depends(get_db)):
    # placeholder for any server-side fixups; left minimal
    return {"ok": True}

@router.post("/batch_create_recurring")
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
            reference=None,
            status="Draft",
            is_recurring=inv.is_recurring,
            recurrence_interval=inv.recurrence_interval,
            recurrence_end_date=inv.recurrence_end_date,
            currency_code=getattr(inv, "currency_code", "KES"),
            exchange_rate=float(getattr(inv, "exchange_rate", 1.0) or 1.0),
            cu_inv_number=getattr(inv, "cu_inv_number", None),
            total_amount=0.0,
        )
        db.add(new_inv)
        db.flush()

        src_lines = db.query(models.PurchaseInvoiceLine).filter(
            models.PurchaseInvoiceLine.purchase_invoice_id == inv.id
        ).all()
        for ln in src_lines:
            db.add(models.PurchaseInvoiceLine(
                purchase_invoice_id=new_inv.id,
                type=ln.type,
                product_id=ln.product_id,
                item=ln.item,
                account_code=ln.account_code,
                description=ln.description,
                quantity=ln.quantity,
                unit_price=ln.unit_price,
                vat_code=ln.vat_code,
                excise_code=ln.excise_code,
            ))

        tax_options = get_tax_options(db)
        new_lines = db.query(models.PurchaseInvoiceLine).filter(
            models.PurchaseInvoiceLine.purchase_invoice_id == new_inv.id
        ).all()
        new_inv.total_amount = calculate_invoice_total(new_lines, tax_options)
        db.commit()

        created += 1

    return {"created": created}

@router.post("/{invoice_id}/copy")
def copy_purchase_invoices(invoice_id: int, db: Session = Depends(get_db)):
    original = db.query(models.PurchaseInvoice).filter(models.PurchaseInvoice.id == invoice_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Invoice not found")

    new_inv = models.PurchaseInvoice(
        supplier_id=original.supplier_id,
        invoice_date=date.today(),
        status="Draft",
        is_recurring=original.is_recurring,
        recurrence_interval=original.recurrence_interval,
        recurrence_end_date=original.recurrence_end_date,
        currency_code=getattr(original, "currency_code", "KES"),
        exchange_rate=float(getattr(original, "exchange_rate", 1.0) or 1.0),
        cu_inv_number=getattr(original, "cu_inv_number", None),
        total_amount=0.0,
        reference=None,
    )
    db.add(new_inv)
    db.flush()

    lines = db.query(models.PurchaseInvoiceLine).filter(
        models.PurchaseInvoiceLine.purchase_invoice_id == invoice_id
    ).all()
    for ln in lines:
        db.add(models.PurchaseInvoiceLine(
            purchase_invoice_id=new_inv.id,
            type=ln.type,
            product_id=ln.product_id,
            item=ln.item,
            account_code=ln.account_code,
            description=ln.description,
            quantity=ln.quantity,
            unit_price=ln.unit_price,
            vat_code=ln.vat_code,
            excise_code=ln.excise_code,
        ))

    tax_options = get_tax_options(db)
    new_lines = db.query(models.PurchaseInvoiceLine).filter(
        models.PurchaseInvoiceLine.purchase_invoice_id == new_inv.id
    ).all()
    new_inv.total_amount = calculate_invoice_total(new_lines, tax_options)
    db.commit()

    return {"id": new_inv.id}

@router.post("/batch_delete")
def batch_delete(ids: list = Body(...), db: Session = Depends(get_db)):
    deleted = 0
    for invoice_id in ids:
        inv = db.query(models.PurchaseInvoice).filter_by(id=invoice_id).first()
        if inv:
            _remove_stock_entries_for_purchase(db, inv)
            db.delete(inv)
            deleted += 1
    db.commit()
    return {"deleted": deleted}

@router.post("/batch_post")
def batch_post(ids: list = Body(...), db: Session = Depends(get_db)):
    posted = 0
    for invoice_id in ids:
        inv = db.query(models.PurchaseInvoice).filter_by(id=invoice_id).first()
        if inv and inv.status != "Posted":
            inv.status = "Posted"
            db.flush()
            _rebuild_stock_entries_for_purchase(db, inv)
            posted += 1
    db.commit()
    return {"posted": posted}
