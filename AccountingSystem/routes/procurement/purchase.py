# routes/purchase.py
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import date, timedelta, datetime
from io import BytesIO

from database import get_db
from models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceLine
from models.stock_entry import StockEntry
import models  # Keep for other models like Supplier, Product, Tax
from schemas.purchase_invoice import (
    PurchaseInvoiceCreate,
    PurchaseInvoiceUpdate,
    PurchaseInvoiceOut,
)

# -------------------- Helpers --------------------

def calculate_next_issue_date(current_date: date, recurrence_interval: str) -> date:
    if not recurrence_interval:
        return current_date
    
    # Parse common formats: "1 months", "monthly", "3 months", etc.
    interval_lower = recurrence_interval.lower().strip()
    
    if "month" in interval_lower:
        if "monthly" in interval_lower or interval_lower == "1 months" or interval_lower == "1 month":
            months = 1
        else:
            # Extract number from patterns like "3 months"
            import re
            match = re.search(r'(\d+)\s*months?', interval_lower)
            months = int(match.group(1)) if match else 1
        
        # Add months to current date
        new_month = current_date.month + months
        new_year = current_date.year
        while new_month > 12:
            new_month -= 12
            new_year += 1
        
        # Handle day overflow (e.g., Jan 31 + 1 month = Feb 28/29)
        import calendar
        max_day = calendar.monthrange(new_year, new_month)[1]
        new_day = min(current_date.day, max_day)
        
        return date(new_year, new_month, new_day)
    
    elif "year" in interval_lower:
        years = 1
        if "12 months" in interval_lower:
            years = 1
        else:
            import re
            match = re.search(r'(\d+)\s*years?', interval_lower)
            years = int(match.group(1)) if match else 1
        return date(current_date.year + years, current_date.month, current_date.day)
    
    else:
        # Default to 1 month if format not recognized
        return calculate_next_issue_date(current_date, "1 months")

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
            "account_code": str(t.account_code or ""),
            "type": (t.type or "").upper(),
            "rate": float(t.rate or 0),
            "name": t.name or "",
        })
    return out

def _find_rate(options, code, tax_type):
    if not code:
        return 0.0
    ttype = (tax_type or "").upper()
    for t in options:
        if (t["type"] or "").upper() == ttype and (str(t["id"]) == str(code) or t["account_code"] == str(code)):
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

def _rebuild_stock_entries_for_purchase(db: Session, purchase: PurchaseInvoice):
    _remove_stock_entries_for_purchase(db, purchase)
    lines = db.query(PurchaseInvoiceLine).filter_by(purchase_invoice_id=purchase.id).all()
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
    return db.query(PurchaseInvoice).all()

@router.get("/purchase-invoices")
def list_purchase_invoices(db: Session = Depends(get_db)):
    purchases = (
        db.query(PurchaseInvoice)
        .options(joinedload(PurchaseInvoice.lines))
        .all()
    )
    supplier_ids = [p.supplier_id for p in purchases if p.supplier_id]
    # Fetch supplier name and pin for all relevant suppliers
    suppliers = {}
    for s in db.query(models.Supplier).filter(models.Supplier.id.in_(supplier_ids)).all():
        # Prefer kra_pin if present; fallback to generic pin
        pin_val = getattr(s, "kra_pin", None)
        if not pin_val:
            pin_val = getattr(s, "pin", None)
        suppliers[s.id] = {"name": s.name, "pin": pin_val}
    out = []
    for p in purchases:
        data = PurchaseInvoiceOut.from_orm(p).dict()
        supplier_info = suppliers.get(p.supplier_id, {})
        data["supplier_name"] = supplier_info.get("name", "")
        data["supplier_pin"] = supplier_info.get("pin", "")
        data["amount_paid"] = getattr(p, "amount_paid", 0)
        data["balance_due"] = (p.total_amount or 0) - data["amount_paid"]
        out.append(data)
    return out

@router.get("/pending_recurring", response_model=list[PurchaseInvoiceOut])
def get_pending_recurring(db: Session = Depends(get_db)):
    # Get recurring invoices with supplier names - keep original logic
    purchases = (
        db.query(PurchaseInvoice)
        .filter(PurchaseInvoice.is_recurring == True)
        .options(joinedload(PurchaseInvoice.lines))
        .all()
    )
    supplier_ids = [p.supplier_id for p in purchases if p.supplier_id]
    suppliers = {s.id: s.name for s in db.query(models.Supplier).filter(models.Supplier.id.in_(supplier_ids)).all()}
    
    out = []
    for p in purchases:
        # Calculate next issue date if not set (this is the main fix needed)
        if not p.next_issue_date and p.recurrence_interval:
            p.next_issue_date = calculate_next_issue_date(p.invoice_date, p.recurrence_interval)
        
        data = PurchaseInvoiceOut.from_orm(p).dict()
        data["supplier_name"] = suppliers.get(p.supplier_id, f"Unknown Supplier (ID: {p.supplier_id})")
        # Add fields expected by frontend
        data["template_id"] = p.id  # Use the invoice ID as template ID
        
        # Build description from line items (item/description)
        line_descriptions = []
        for line in p.lines:
            item_desc = []
            if line.item:
                item_desc.append(line.item)
            if line.description and line.description != line.item:
                item_desc.append(line.description)
            if item_desc:
                line_descriptions.append(" / ".join(item_desc))
        
        data["description"] = ", ".join(line_descriptions) if line_descriptions else p.reference or "No description"
        out.append(data)
    
    db.commit()  # Save any calculated next_issue_dates
    return out

@router.get("/taxes/")
def get_taxes(db: Session = Depends(get_db)):
    return get_tax_options(db)

# -------------------- Detail / Mutations --------------------

@router.get("/{id}")
def get_purchase(id: int, db: Session = Depends(get_db)):
    purchase = (
        db.query(PurchaseInvoice)
        .options(joinedload(PurchaseInvoice.lines))
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
        # Expose supplier PIN for view dialogs and reports
        "supplier_pin": getattr(supplier, "kra_pin", None) or getattr(supplier, "pin", None) or "",
        "reference": purchase.reference,
        "total": purchase.total_amount,
        "amount_paid": getattr(purchase, "amount_paid", 0),
        "balance_due": (purchase.total_amount or 0) - (getattr(purchase, "amount_paid", 0) or 0),
        "status": purchase.status,
        "currency_code": curr,
        "exchange_rate": rate,
        "cu_inv_number": getattr(purchase, "cu_inv_number", None),
        "make_recurring": getattr(purchase, "make_recurring", False),
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
    print(f"🔍 [CREATE] Received invoice data: supplier_id={invoice.supplier_id}, lines_count={len(invoice.lines or [])}")
    print(f"🔍 [CREATE] Lines: {invoice.lines}")
    code = (invoice.currency_code or "KES").split()[0].upper()
    rate = float(invoice.exchange_rate or 1.0)
    db_invoice = PurchaseInvoice(
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
        db.add(PurchaseInvoiceLine(
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
    lines = db.query(PurchaseInvoiceLine).filter_by(purchase_invoice_id=db_invoice.id).all()
    db_invoice.total_amount = calculate_invoice_total(lines, tax_options)
    db.commit()
    db.refresh(db_invoice)
    return {"id": db_invoice.id}

@router.put("/{id}/edit")
def update_purchase(id: int, invoice: PurchaseInvoiceUpdate, db: Session = Depends(get_db)):
    print(f"🔍 [UPDATE] Purchase ID={id}, lines_count={len(invoice.lines or [])}")
    print(f"🔍 [UPDATE] Lines: {invoice.lines}")
    inv = db.query(PurchaseInvoice).filter_by(id=id).first()
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
    
    # Calculate next_issue_date when marking as recurring
    if inv.is_recurring and inv.recurrence_interval and not inv.next_issue_date:
        inv.next_issue_date = calculate_next_issue_date(inv.invoice_date, inv.recurrence_interval)


    # lines
    if invoice.lines is not None:
        print(f"[DEBUG] Update: Incoming lines: {invoice.lines}")
        existing_lines = db.query(PurchaseInvoiceLine).filter_by(purchase_invoice_id=id).all()
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
                db.add(PurchaseInvoiceLine(
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
    lines = db.query(PurchaseInvoiceLine).filter_by(purchase_invoice_id=id).all()
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
        template_id = item.get("template_id") or item.get("invoice_id")  # Support both field names
        template = db.query(PurchaseInvoice).filter(PurchaseInvoice.id == template_id).first()
        if not template or not template.is_recurring or not template.recurrence_interval:
            continue

        # Use template's next_issue_date or calculate it
        issue_date = template.next_issue_date or calculate_next_issue_date(template.invoice_date, template.recurrence_interval)
        
        # Check if invoice for this date already exists
        exists = db.query(PurchaseInvoice).filter(
            PurchaseInvoice.supplier_id == template.supplier_id,
            PurchaseInvoice.invoice_date == issue_date,
            PurchaseInvoice.is_recurring == False  # Only check non-template invoices
        ).first()
        if exists:
            continue

        # Create new invoice from template (NOT recurring)
        new_inv = PurchaseInvoice(
            supplier_id=template.supplier_id,
            invoice_date=issue_date,
            reference=f"{template.reference or 'REC'}-{issue_date.strftime('%Y%m')}",
            status="Draft",
            is_recurring=False,  # New invoice is NOT a template
            recurrence_interval=None,
            recurrence_end_date=None,
            next_issue_date=None,
            currency_code=getattr(template, "currency_code", "KES"),
            exchange_rate=float(getattr(template, "exchange_rate", 1.0) or 1.0),
            cu_inv_number=None,  # New invoice gets new number
            total_amount=0.0,
        )
        db.add(new_inv)
        db.flush()

        src_lines = db.query(PurchaseInvoiceLine).filter(
            PurchaseInvoiceLine.purchase_invoice_id == template.id
        ).all()
        for ln in src_lines:
            db.add(PurchaseInvoiceLine(
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

        # Calculate total for new invoice
        tax_options = get_tax_options(db)
        new_lines = db.query(PurchaseInvoiceLine).filter(
            PurchaseInvoiceLine.purchase_invoice_id == new_inv.id
        ).all()
        new_inv.total_amount = calculate_invoice_total(new_lines, tax_options)
        
        # Update template's next_issue_date
        template.next_issue_date = calculate_next_issue_date(issue_date, template.recurrence_interval)
        
        created += 1

    db.commit()
    return {"created": created}

@router.post("/batch_delete_recurring_templates")
def batch_delete_recurring_templates(template_ids: list[int] = Body(...), db: Session = Depends(get_db)):
    """Delete recurring invoice templates (turn off recurring, don't delete actual invoices)"""
    deleted = 0
    for template_id in template_ids:
        template = db.query(PurchaseInvoice).filter(
            PurchaseInvoice.id == template_id,
            PurchaseInvoice.is_recurring == True
        ).first()
        
        if template:
            # Turn off recurring instead of deleting
            template.is_recurring = False
            template.recurrence_interval = None
            template.recurrence_end_date = None
            template.next_issue_date = None
            deleted += 1
    
    db.commit()
    return {"deleted": deleted}

@router.post("/{invoice_id}/copy")
def copy_purchase_invoices(invoice_id: int, db: Session = Depends(get_db)):
    original = db.query(PurchaseInvoice).filter(PurchaseInvoice.id == invoice_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Invoice not found")

    new_inv = PurchaseInvoice(
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

    lines = db.query(PurchaseInvoiceLine).filter(
        PurchaseInvoiceLine.purchase_invoice_id == invoice_id
    ).all()
    for ln in lines:
        db.add(PurchaseInvoiceLine(
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
    new_lines = db.query(PurchaseInvoiceLine).filter(
        PurchaseInvoiceLine.purchase_invoice_id == new_inv.id
    ).all()
    new_inv.total_amount = calculate_invoice_total(new_lines, tax_options)
    db.commit()

    return {"id": new_inv.id}

@router.post("/batch_delete")
def batch_delete(ids: list = Body(...), db: Session = Depends(get_db)):
    deleted = 0
    for invoice_id in ids:
        inv = db.query(PurchaseInvoice).filter_by(id=invoice_id).first()
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
        inv = db.query(PurchaseInvoice).filter_by(id=invoice_id).first()
        if inv and inv.status != "Posted":
            inv.status = "Posted"
            db.flush()
            _rebuild_stock_entries_for_purchase(db, inv)
            posted += 1
    db.commit()
    return {"posted": posted}

@router.get("/{id}/pdf")
def get_purchase_pdf(id: int, db: Session = Depends(get_db)):
    """Generate clean invoice PDF matching the reference design"""
    try:
        from fastapi.responses import StreamingResponse
        from io import BytesIO
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

        # Fetch data
        purchase = db.query(PurchaseInvoice).filter_by(id=id).first()
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase invoice not found")

        lines = db.query(PurchaseInvoiceLine).filter_by(purchase_invoice_id=id).all()
        supplier = db.query(models.Supplier).filter_by(id=purchase.supplier_id).first()

        # Company info
        from models.company import CompanyProfile
        company = db.query(CompanyProfile).first()
        company_name = getattr(company, "name", None) or getattr(company, "company_name", None) or "Tandaa Networks"
        company_address = getattr(company, "address", None) or "Kilifi, Kilifi Creek"
        company_email = getattr(company, "email", None) or "support@tandaa.africa" 
        company_phone = getattr(company, "phone", None) or "0768886466,0730729729"

        # Tax options
        tax_options = get_tax_options(db)
        vat_rates = {}
        excise_rates = {}

        for tax in tax_options:
            ttype = str(tax.get("type", "") or "").upper()
            code_key = str(tax.get("account_code", "") or "")
            rate = float(tax.get("rate", 0) or 0)
            if "VAT" in ttype:
                vat_rates[code_key] = rate
            elif "EXCISE" in ttype:
                excise_rates[code_key] = rate

        # Define exact column widths for perfect alignment - DEFINE EARLY BEFORE ANY TABLE USAGE
        desc_width = 90*mm    # Description column
        rate_width = 30*mm    # Rate column  
        qty_width = 25*mm     # Quantity column
        price_width = 25*mm   # Price column

        # Calculate totals
        subtotal = 0.0
        excise_total = 0.0
        vat_total = 0.0

        for line in lines:
            qty = float(line.quantity or 0)
            unit_price = float(line.unit_price or 0)
            base_amount = qty * unit_price
            
            # Excise
            excise_key = str(line.excise_code or "")
            excise_rate = excise_rates.get(excise_key, 0.0)
            excise_amount = base_amount * excise_rate
            
            # VAT
            vat_key = str(line.vat_code or "")
            vat_rate = vat_rates.get(vat_key, 0.0)
            vat_amount = (base_amount + excise_amount) * vat_rate
            
            subtotal += base_amount
            excise_total += excise_amount
            vat_total += vat_amount

        total = subtotal + excise_total + vat_total

        # PDF setup
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm, leftMargin=20*mm, rightMargin=20*mm)
        story = []
        styles = getSampleStyleSheet()

        # Header with white background bar
        header_data = [["P U R C H A S E   I N V O I C E"]]
        header_table = Table(header_data, colWidths=[170*mm])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.black),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 14),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 10*mm))

        supplier_name = supplier.name if supplier else "Unknown Supplier"
        
        # Company info and supplier details - aligned properly in same layout
        company_info = f"""
<b>{company_name}</b><br/>
{company_address}<br/>
Kenya 80108<br/>
Email: {company_email}<br/>
Phone: {company_phone}
        """
        
        supplier_details = f"""
<b>To:</b><br/>
{supplier_name}<br/>
Kilifi Kenya<br/>
{getattr(supplier, 'email', '') or 'N/A'}<br/>
<b>KRA PIN:</b> {getattr(supplier, 'kra_pin', '') or 'N/A'}
        """
        
        # Add company info and supplier on same row for proper alignment
        company_supplier_data = [
            [Paragraph(company_info, styles['Normal']), Paragraph(supplier_details, styles['Normal'])]
        ]
        
        company_supplier_table = Table(company_supplier_data, colWidths=[desc_width, rate_width + qty_width + price_width])
        company_supplier_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(company_supplier_table)
        story.append(Spacer(1, 10*mm))
        
        # Invoice details in table format with borders - aligned with Quantity + Price columns
        invoice_details_data = [
            ["Invoice #", purchase.reference or f'INV-{id}'],
            ["Date Created", str(purchase.invoice_date)],
            ["Due Date", str(purchase.invoice_date)], 
            ["Status", 'Paid' if float(getattr(purchase, 'amount_paid', 0) or 0) > 0 else 'Unpaid']
        ]
        
        # Create invoice details table with borders - smaller font and better alignment
        invoice_table = Table(invoice_details_data, colWidths=[qty_width, price_width])  # Exact alignment with Quantity + Price
        invoice_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),  # Smaller font
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        # Invoice table positioned to align with quantity and price columns
        invoice_wrapper_data = [["", "", invoice_table]]
        invoice_wrapper_table = Table(invoice_wrapper_data, colWidths=[desc_width, rate_width, qty_width + price_width])
        invoice_wrapper_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(invoice_wrapper_table)
        story.append(Spacer(1, 15*mm))

        # Items table - using consistent column widths
        items_data = [["Description", "Rate", "Quantity", "Price"]]
        
        for line in lines:
            qty = float(line.quantity or 0)
            unit_price = float(line.unit_price or 0)
            base_amount = qty * unit_price
            
            # Calculate tax-inclusive line total
            excise_key = str(line.excise_code or "")
            excise_rate = excise_rates.get(excise_key, 0.0)
            excise_amount = base_amount * excise_rate
            
            vat_key = str(line.vat_code or "")
            vat_rate = vat_rates.get(vat_key, 0.0)
            vat_amount = (base_amount + excise_amount) * vat_rate
            
            line_total_inclusive = base_amount + excise_amount + vat_amount
            
            # Combine item and description
            description = f"{line.item or ''}"
            if line.description and line.description != line.item:
                description = f"{line.item or ''} | {line.description}"
            
            items_data.append([
                description[:50],  # Limit length
                f"Ksh {unit_price:,.2f}",
                f"{qty:,.0f}",
                f"Ksh {line_total_inclusive:,.2f}"  # Tax-inclusive price
            ])

        # Use the same exact column widths throughout
        items_table = Table(items_data, colWidths=[desc_width, rate_width, qty_width, price_width])
        items_table.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),  # Smaller header font
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),   # Description
            ('ALIGN', (1, 0), (1, -1), 'CENTER'), # Rate  
            ('ALIGN', (2, 0), (2, -1), 'CENTER'), # Quantity
            ('ALIGN', (3, 0), (3, -1), 'RIGHT'),  # Price
            # Body
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),  # Smaller body font
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),  # Reduced padding
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(items_table)
        story.append(Spacer(1, 10*mm))

        # Summary totals - aligned with Quantity + Price columns exactly
        summary_data = [
            ["Sub total", f"Ksh {subtotal:,.2f}"],
            ["VAT", f"Ksh {vat_total:,.2f}"],
            ["Excise", f"Ksh {excise_total:,.2f}"],
            ["Total", f"Ksh {total:,.2f}"]
        ]

        # Position summary table to align with Quantity + Price columns
        # Need to offset by Description + Rate widths to align perfectly
        summary_table = Table(summary_data, colWidths=[qty_width, price_width], hAlign='RIGHT')
        summary_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -2), 'Helvetica'),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),  # Same small font for all including total
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),  # Even smaller padding
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        
        # Create a wrapper table to position summary correctly
        summary_wrapper_data = [["", "", summary_table]]
        summary_wrapper = Table(summary_wrapper_data, colWidths=[desc_width, rate_width, qty_width + price_width])
        summary_wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(summary_wrapper)

        # Build PDF
        doc.build(story)
        buf.seek(0)

        filename = f"invoice_{purchase.reference or id}.pdf"
        return StreamingResponse(
            BytesIO(buf.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        print(f"PDF Error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
