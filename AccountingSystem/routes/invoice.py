# ✅ FULLY UPDATED invoice.py — Fixed journal posting with padded account codes and working PDF generation

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from datetime import date, datetime
from io import BytesIO
# Defer importing reportlab until PDF generation to avoid blocking app startup when reportlab
# is not installed in the environment. The invoice_pdf endpoint will return a friendly
# error if reportlab is missing.

from database import get_db
import models
from schemas.invoice import InvoiceCreate, InvoiceResponse, InvoiceListResponse
from schemas.invoice_line import InvoiceLineResponse

router = APIRouter(prefix="/invoices", tags=["Invoicing"])

# --- Rounding helpers ---
def r1(x):  # round to 1 dp
    return round(float(x or 0) * 10) / 10.0

def r0(x):  # round to 0 dp (grand totals)
    return round(float(x or 0))

def sum_r1(vals):
    return r1(sum(float(v or 0) for v in vals))

# -------------------- GET Invoices (with optional filters) --------------------
@router.get("/", response_model=InvoiceListResponse)
def list_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * limit
    invoices = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.customer))
        .offset(offset)
        .limit(limit)
        .all()
    )
    total = db.query(func.count(models.Invoice.id)).scalar()
    items = [
        InvoiceResponse(
            invoice_number=inv.invoice_number,
            invoice_date=inv.invoice_date,
            customer_name=inv.customer.name if inv.customer else "",
            description=inv.description,
            amount=r1(inv.amount),    # <-- round to 1dp
            vat=r1(inv.vat),         # <-- round to 1dp
            excise=r1(inv.excise),   # <-- round to 1dp
            cu_inv_number=getattr(inv, "cu_inv_number", ""),
            status=inv.status,
            balance_due=getattr(inv, "balance_due", 0),
            lines=[
                InvoiceLineResponse(
                    id=line.id,
                    product_id=line.product_id,
                    item=line.item,
                    description=line.description,
                    quantity=r1(line.quantity),
                    unit_price=r1(line.unit_price),
                    amount=r1(line.amount),
                    type="Product" if line.product_id else "Service",
                    vat=line.vat,
                    excise=line.excise,
                    vat_code=getattr(line, "vat_code", None),
                    excise_code=getattr(line, "excise_code", None),
                ) for line in inv.lines
            ],
            grand_total=r0(r1(inv.amount) + r1(inv.vat) + r1(inv.excise))  # <-- round to 0dp
        )
        for inv in invoices
    ]
    return InvoiceListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=(total + limit - 1) // limit,
    )

# -------------------- POST New Invoice --------------------
@router.post("/", response_model=InvoiceResponse)
def create_invoice(invoice: InvoiceCreate, db: Session = Depends(get_db)):
    customer = (
        db.query(models.Customer)
        .filter(models.Customer.client_number == int(invoice.client_number))
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found (client_number)")

    # Calculate base subtotal, vat, excise from lines
    base_amount = sum_r1([r1(li.quantity) * r1(li.unit_price) for li in invoice.lines])
    vat_total = sum_r1([li.vat for li in invoice.lines])
    excise_total = sum_r1([li.excise for li in invoice.lines])
    grand_total = r0(base_amount + vat_total + excise_total)

    new_invoice = models.Invoice(
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        customer_id=customer.id,
        description=invoice.description,
        cu_inv_number=invoice.cu_inv_number,
        amount=base_amount,
        vat=vat_total,
        excise=excise_total,
        status="Issued"
    )
    db.add(new_invoice)
    db.flush()

    for line in invoice.lines:
        db.add(models.InvoiceLine(
            invoice_id=new_invoice.id,
            product_id=line.product_id if line.type == "Product" else None,
            item=line.item,
            description=line.description,
            quantity=r1(line.quantity),
            unit_price=r1(line.unit_price),
            amount=r1(line.amount),
            vat=r1(line.vat),
            excise=r1(line.excise),
            type=line.type,
            vat_code=getattr(line, "vat_code", None),         # <-- keep codes
            excise_code=getattr(line, "excise_code", None),   # <--
        ))

    db.commit()
    db.refresh(new_invoice)

    return InvoiceResponse(
        invoice_number=new_invoice.invoice_number,
        invoice_date=new_invoice.invoice_date,
        customer_name=customer.name,
        description=new_invoice.description,
        amount=new_invoice.amount,
        vat=new_invoice.vat,
        excise=new_invoice.excise,
        cu_inv_number=getattr(new_invoice, "cu_inv_number", ""),
        status=new_invoice.status,
        balance_due=getattr(new_invoice, "balance_due", 0),
        lines=[
            InvoiceLineResponse(
                id=line.id,
                product_id=line.product_id,
                item=line.item,
                description=line.description,
                quantity=r1(line.quantity),
                unit_price=r1(line.unit_price),
                amount=r1(line.amount),
                type="Product" if line.product_id else "Service",
                vat=line.vat,
                excise=line.excise,
                vat_code=getattr(line, "vat_code", None),         # <-- include codes in response
                excise_code=getattr(line, "excise_code", None),   # <--
            ) for line in new_invoice.lines
        ],
        grand_total=r0(new_invoice.amount + new_invoice.vat + new_invoice.excise)
    )

# -------------------- POST Invoice to Journal --------------------
@router.post("/{invoice_number}/post_to_journal")
def post_invoice_to_journal(invoice_number: str, db: Session = Depends(get_db)):
    print(f"\u25b6\ufe0f Posting invoice {invoice_number} to journal")

    invoice = db.query(models.Invoice).filter(models.Invoice.invoice_number == invoice_number).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.journal_ref:
        raise HTTPException(status_code=400, detail="Invoice already posted to journal")

    ar_account = db.query(models.Account).filter_by(account_code="122").first()
    sales_account = db.query(models.Account).filter_by(account_code="004").first()

    if not ar_account or not sales_account:
        raise HTTPException(status_code=400, detail="Missing required account codes (122 or 004)")

    customer = db.query(models.Customer).filter_by(id=invoice.customer_id).first()
    reference = f"INV-{invoice.invoice_number}"
    narration = f"Invoice {invoice.invoice_number} - {customer.name if customer else 'Unknown'}"

    journal = models.JournalEntry(
        date=invoice.invoice_date,
        reference=reference,
        narration=narration
    )
    db.add(journal)
    db.commit()
    db.refresh(journal)

    lines = [
        models.JournalLine(
            journal_entry_id=journal.id,
            account_code="122",
            account_id=ar_account.id,
            narration="Accounts Receivable",
            debit=invoice.amount,
            credit=0.0
        ),
        models.JournalLine(
            journal_entry_id=journal.id,
            account_code="004",
            account_id=sales_account.id,
            narration="Sales Revenue",
            debit=0.0,
            credit=invoice.amount
        )
    ]
    db.add_all(lines)

    for item in invoice.lines:
        if item.product_id:
            db.add(models.StockEntry(
                product_id=item.product_id,
                quantity=item.quantity,
                type="OUT",
                reference=invoice.invoice_number,
                date=invoice.invoice_date,
                remarks=f"Sold via invoice {invoice.invoice_number}"
            ))

    invoice.journal_ref = reference
    invoice.status = "Posted"
    db.commit()

    print("\u2705 Invoice posted and stock updated")
    return {"message": "Invoice journal posted and stock updated"}

# -------------------- GET Invoice PDF (single endpoint, company info) --------------------
@router.get("/{invoice_number}/pdf")
def invoice_pdf(invoice_number: str, db: Session = Depends(get_db)):
    from models.company import CompanyProfile  # local import to avoid circular
    inv = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.lines))
        .filter(models.Invoice.invoice_number == invoice_number)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    company = db.query(CompanyProfile).first()
    # safe fallbacks
    c_name = getattr(company, "name", None) or getattr(company, "company_name", None) or "Company"
    c_addr = getattr(company, "address", None) or getattr(company, "postal_address", None) or ""
    c_phone = getattr(company, "phone", None) or ""
    c_email = getattr(company, "email", None) or ""
    c_pin = getattr(company, "kra_pin", None) or ""
    c_logo = getattr(company, "logo_path", None) or getattr(company, "logo_file", None)

    # compute totals
    subtotal = float(inv.amount or 0)
    excise = float(inv.excise or 0)
    vat = float(inv.vat or 0)

    # fallback: if excise/vat are 0, sum from lines
    if excise == 0 or vat == 0:
        excise = sum(float(li.excise or 0) for li in inv.lines) or excise
        vat = sum(float(li.vat or 0) for li in inv.lines) or vat

    # rounding rules
    subtotal = r1(subtotal)
    excise = r1(excise)
    vat = r1(vat)
    grand = r0(subtotal + excise + vat)

    # build PDF (import reportlab lazily so missing dependency doesn't prevent app start)
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except Exception:
        raise HTTPException(status_code=503, detail=(
            "PDF generation dependency 'reportlab' is not installed. "
            "Install it with: pip install reportlab"
        ))

    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    y = height - 40
    # Logo
    if c_logo:
        try:
            pdf.drawImage(c_logo, width - 160, y - 10, width=120, height=40, preserveAspectRatio=True, mask='auto')
        except Exception:
            pass

    # Company block
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(40, y, c_name)
    pdf.setFont("Helvetica", 9)
    y -= 14
    if c_addr: pdf.drawString(40, y, c_addr); y -= 12
    if c_email: pdf.drawString(40, y, f"Email: {c_email}"); y -= 12
    if c_phone: pdf.drawString(40, y, f"Phone: {c_phone}"); y -= 12
    if c_pin:   pdf.drawString(40, y, f"KRA PIN: {c_pin}"); y -= 16

    # Invoice header
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, y, "INVOICE")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, y-14, f"Invoice #: {inv.invoice_number}")
    pdf.drawString(40, y-28, f"CU INV Number: {getattr(inv, 'cu_inv_number', '-') or '-'}")
    pdf.drawString(300, y-14, f"Date: {inv.invoice_date}")
    y -= 44

    # Bill To
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(40, y, "Bill To")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, y-12, f"{getattr(inv, 'customer_name', '') or ''}")
    y -= 28

    # Description (if any)
    if getattr(inv, "description", None):
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(40, y, "Description")
        y -= 12
        pdf.setFont("Helvetica", 10)
        pdf.drawString(40, y, inv.description[:100])
        y -= 20

    # Lines header
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(40, y, "Type")
    pdf.drawString(120, y, "Item")
    pdf.drawString(260, y, "Description")
    pdf.drawRightString(420, y, "Qty")
    pdf.drawRightString(500, y, "Unit Price")
    pdf.drawRightString(560, y, "Amount")
    y -= 14
    pdf.setFont("Helvetica", 10)

    for li in inv.lines:
        if y < 80:  # next page
            pdf.showPage(); y = height - 40
        pdf.drawString(40, y, (li.type or ""))
        pdf.drawString(120, y, (li.item or str(getattr(li, "product_id", "") or ""))[:20])
        pdf.drawString(260, y, (li.description or "")[:40])
        pdf.drawRightString(420, y, f"{r1(li.quantity):,.1f}")
        pdf.drawRightString(500, y, f"{r1(li.unit_price):,.2f}")
        pdf.drawRightString(560, y, f"{r1(li.amount):,.2f}")
        y -= 14

    # Totals box
    if y < 80: pdf.showPage(); y = height - 40
    y -= 10
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(500, y, "Subtotal")
    pdf.drawRightString(560, y, f"{subtotal:,.2f}")
    y -= 12
    pdf.drawRightString(500, y, "Excise")
    pdf.drawRightString(560, y, f"{excise:,.2f}")
    y -= 12
    pdf.drawRightString(500, y, "VAT")
    pdf.drawRightString(560, y, f"{vat:,.2f}")
    y -= 14
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(500, y, "Grand Total")
    pdf.drawRightString(560, y, f"{grand:,.2f}")

    pdf.showPage()
    pdf.save()
    buf.seek(0)

    return StreamingResponse(buf, media_type="application/pdf", headers={
        "Content-Disposition": f"inline; filename=Invoice_{inv.invoice_number}.pdf"
    })

# -------------------- GET Invoice by Invoice Number (includes lines) --------------------
@router.get("/{invoice_number}", response_model=InvoiceResponse)
def get_invoice(invoice_number: str, db: Session = Depends(get_db)):
    inv = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.customer), joinedload(models.Invoice.lines))
        .filter(models.Invoice.invoice_number == invoice_number)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    base_amount = r1(sum(r1(l.quantity) * r1(l.unit_price) for l in inv.lines))
    vat_total   = r1(sum(r1(l.vat)    for l in inv.lines))
    exc_total   = r1(sum(r1(l.excise) for l in inv.lines))
    grand_total = r0(base_amount + vat_total + exc_total)

    return InvoiceResponse(
        invoice_number=inv.invoice_number,
        invoice_date=inv.invoice_date,
        customer_name=inv.customer.name if inv.customer else "",
        description=inv.description,
        amount=base_amount,
        vat=vat_total,
        excise=exc_total,
        cu_inv_number=getattr(inv, "cu_inv_number", ""),
        status=inv.status,
        balance_due=getattr(inv, "balance_due", 0),
        lines=[
            InvoiceLineResponse(
                id=l.id,
                product_id=l.product_id,
                item=l.item,
                description=l.description,
                quantity=r1(l.quantity),
                unit_price=r1(l.unit_price),
                amount=r1(l.amount),
                type="Product" if l.product_id else "Service",
                vat=r1(l.vat),
                excise=r1(l.excise),
                vat_code=getattr(l, "vat_code", None),          # <-- include codes
                excise_code=getattr(l, "excise_code", None),    # <--
            ) for l in inv.lines
        ],
        grand_total=grand_total
    )
# -------------------- GET Ledger by Customer --------------------
@router.get("/ledger/{customer_name}")
def get_customer_ledger(
    customer_name: str,
    db: Session = Depends(get_db)
):
    invoices = (
        db.query(models.Invoice)
        .join(models.Customer, models.Invoice.customer_id == models.Customer.id)
        .filter(models.Customer.name.ilike(customer_name))
        .order_by(models.Invoice.invoice_date, models.Invoice.id)
        .all()
    )

    balance = 0
    ledger = []

    for inv in invoices:
        balance += inv.amount
        ledger.append({
            "date": inv.invoice_date,
            "invoice_number": inv.invoice_number,
            "description": inv.description,
            "amount": inv.amount,
            "status": inv.status,
            "running_balance": balance
        })

    return ledger

# -------------------- GET Total Invoiced Revenue --------------------
@router.get("/summary")
def get_invoice_summary(
    db: Session = Depends(get_db)
):
    total = db.query(models.Invoice).with_entities(
        func.sum(models.Invoice.amount)
    ).scalar() or 0

    return {"total_revenue": total}

#---------------------DELETE Invoice ------------------
@router.delete("/{invoice_number}")
def delete_invoice(invoice_number: str, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.invoice_number == invoice_number).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    db.delete(invoice)
    db.commit()
    return {"message": "Invoice deleted successfully"}

# -------------------- UPDATE Invoice --------------------
@router.put("/{invoice_number}", response_model=InvoiceResponse)
def update_invoice(invoice_number: str, updated: InvoiceCreate, db: Session = Depends(get_db)):
    inv = db.query(models.Invoice).filter_by(invoice_number=invoice_number).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # strictly by client_number
    customer = (
        db.query(models.Customer)
        .filter(models.Customer.client_number == int(updated.client_number))
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found (client_number)")

    # wipe & re-add lines, recompute totals
    db.query(models.InvoiceLine).filter_by(invoice_id=inv.id).delete()

    base_amount = sum_r1([r1(li.quantity) * r1(li.unit_price) for li in updated.lines])
    vat_total = sum_r1([li.vat for li in updated.lines])
    exc_total = sum_r1([li.excise for li in updated.lines])

    inv.invoice_date = updated.invoice_date
    inv.customer_id  = customer.id
    inv.description  = updated.description
    inv.cu_inv_number = updated.cu_inv_number
    inv.amount = base_amount
    inv.vat    = vat_total
    inv.excise = exc_total

    for li in updated.lines:
        db.add(models.InvoiceLine(
            invoice_id=inv.id,
            product_id=li.product_id if li.type == "Product" else None,
            item=li.item, description=li.description,
            quantity=r1(li.quantity), unit_price=r1(li.unit_price),
            amount=r1(li.amount), vat=r1(li.vat), excise=r1(li.excise),
            type=li.type,
            vat_code=li.vat_code,                # <-- keep codes
            excise_code=li.excise_code,          # <--
        ))

    db.commit()
    db.refresh(inv)

    return InvoiceResponse(
        invoice_number=inv.invoice_number,
        invoice_date=inv.invoice_date,
        customer_name=customer.name if customer else "Unknown",
        description=inv.description,
        amount=inv.amount,
        vat=inv.vat,
        excise=inv.excise,
        cu_inv_number=getattr(inv, "cu_inv_number", ""),
        status=inv.status,
        balance_due=getattr(inv, "balance_due", 0),
        lines=[
            InvoiceLineResponse(
                id=line.id,
                product_id=line.product_id,
                item=line.item,
                description=line.description,
                quantity=r1(line.quantity),
                unit_price=r1(line.unit_price),
                amount=r1(line.amount),
                type="Product" if line.product_id else "Service",
                vat=line.vat,
                excise=line.excise,
                vat_code=getattr(line, "vat_code", None),
                excise_code=getattr(line, "excise_code", None),
            ) for line in inv.lines
        ],
        grand_total=r0(inv.amount + inv.vat + inv.excise)
    )

# -------------------- PATCH Set Customer for Invoice --------------------
@router.patch("/{invoice_id}/set_customer")
def set_invoice_customer(
    invoice_id: int = Path(..., description="Invoice ID"),
    client_number: int = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    customer = db.query(models.Customer).filter(models.Customer.client_number == client_number).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found with that client_number")

    invoice.customer_id = customer.id
    db.commit()
    db.refresh(invoice)
    return {"success": True, "invoice_id": invoice.id, "customer_id": customer.id}

from models.invoice import Invoice
from models.invoice_line import InvoiceLine

@router.post("/batch-delete")
def batch_delete_invoices(data: dict, db: Session = Depends(get_db)):
    invoice_numbers = data.get("invoice_numbers", [])
    invoices = db.query(Invoice).filter(Invoice.invoice_number.in_(invoice_numbers)).all()
    for inv in invoices:
        # Delete related invoice lines first
        db.query(InvoiceLine).filter(InvoiceLine.invoice_id == inv.id).delete()
        db.delete(inv)
    db.commit()
    return {"deleted": len(invoices)}

def parse_date(val):
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return datetime.strptime(val.strip(), "%Y-%m-%d").date()
        except Exception:
            try:
                return datetime.strptime(val.strip(), "%d-%b-%Y").date()
            except Exception:
                pass
    return None
