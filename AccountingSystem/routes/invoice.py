# ✅ FULLY UPDATED invoice.py — Fixed journal posting with padded account codes and working PDF generation

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from sqlalchemy import func
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from database import get_db
import models
from schemas.invoice import InvoiceCreate, InvoiceResponse
from schemas.invoice_line import InvoiceLineCreate, InvoiceLineResponse

router = APIRouter(prefix="/invoices", tags=["Invoicing"])

# -------------------- GET Invoices (with optional filters) --------------------
@router.get("/")
def get_invoices(status: Optional[str] = Query(None), from_date: Optional[date] = Query(None), to_date: Optional[date] = Query(None), db: Session = Depends(get_db)):
    query = (
        db.query(models.Invoice, models.Customer.name.label("customer_name"))
        .join(models.Customer, models.Invoice.customer_id == models.Customer.id)
    )
    if status:
        query = query.filter(models.Invoice.status == status)
    if from_date and to_date:
        query = query.filter(
            models.Invoice.invoice_date >= from_date,
            models.Invoice.invoice_date <= to_date
        )
    results = query.order_by(models.Invoice.invoice_date.desc()).all()
    return [{**invoice.__dict__, "customer_name": customer_name} for invoice, customer_name in results]

# -------------------- POST New Invoice --------------------
@router.post("/", response_model=InvoiceResponse)
def create_invoice(invoice: InvoiceCreate, db: Session = Depends(get_db)):
    customer = db.query(models.Customer).filter_by(name=invoice.customer_name.strip()).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    total = 0
    for line in invoice.lines:
        if line.type == "Product":
            if not line.product_id or not line.quantity or not line.amount:
                raise HTTPException(status_code=422, detail="Missing product_id, quantity or amount for Product line")
            total += line.quantity * line.amount
        elif line.type == "Service":
            if not line.item or not line.amount:
                raise HTTPException(status_code=422, detail="Missing item or amount for Service line")
            total += line.amount
        else:
            raise HTTPException(status_code=422, detail="Invalid line type")

    new_invoice = models.Invoice(
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        customer_id=customer.id,
        description=invoice.description,
        amount=total,
        vat=invoice.vat,
        excise=invoice.excise,
        status="Issued"
    )
    db.add(new_invoice)
    db.flush()

    for line in invoice.lines:
        db_line = models.InvoiceLine(
            invoice_id=new_invoice.id,
            product_id=line.product_id if line.type == "Product" else None,
            item=line.item,
            description=line.description,
            quantity=line.quantity if line.type == "Product" else 1,
            unit_price=line.unit_price,
            amount=line.amount,
            vat=line.vat,
            excise=line.excise,
            type=line.type
        )
        db.add(db_line)


    db.commit()
    db.refresh(new_invoice)

    return InvoiceResponse(
        id=new_invoice.id,
        invoice_number=new_invoice.invoice_number,
        invoice_date=new_invoice.invoice_date,
        customer_name=customer.name,
        description=new_invoice.description,
        amount=new_invoice.amount,
        vat=new_invoice.vat,
        excise=new_invoice.excise,
        lines=[
            InvoiceLineResponse(
                id=line.id,
                product_id=line.product_id,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,  # <-- Add this line!
                amount=line.amount,
                type="Product" if line.product_id else "Service",
                vat=line.vat if line.vat is not None else 0,
                excise=line.excise if line.excise is not None else 0
            ) for line in new_invoice.lines
        ]
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

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import Table, TableStyle
from io import BytesIO
from fastapi.responses import StreamingResponse

# -------------------- GET Invoice PDF --------------------
@router.get("/{invoice_number}/pdf")
def generate_invoice_pdf(invoice_number: str, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter_by(invoice_number=invoice_number).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    customer = db.query(models.Customer).filter_by(id=invoice.customer_id).first()

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Header
    p.setFont("Helvetica-Bold", 14)
    p.drawString(40, height - 50, "{{company_name}}")
    p.setFont("Helvetica", 10)
    p.drawString(40, height - 65, "{{company_address}}")
    p.drawString(40, height - 80, "Email: {{email}}")
    p.drawString(40, height - 95, "Phone: {{phone}}")
    p.drawString(40, height - 110, "KRA PIN: {{kra_pin}}")

    # Logo Placeholder
    p.setFont("Helvetica-Oblique", 12)
    p.drawString(400, height - 130, "[Company Logo Here]")

    # Invoice metadata
    p.setFont("Helvetica-Bold", 10)
    p.drawString(400, height - 160, "Invoice #:")
    p.drawString(400, height - 175, "Status:")
    p.drawString(400, height - 190, "Date Created:")
    p.drawString(400, height - 205, "Due Date:")

    p.setFont("Helvetica", 10)
    p.drawString(480, height - 160, invoice.invoice_number)
    p.drawString(480, height - 175, invoice.status or "Issued")
    p.drawString(480, height - 190, str(invoice.invoice_date))
    p.drawString(480, height - 205, str(invoice.invoice_date))

    # Customer section
    p.setFont("Helvetica-Bold", 10)
    p.drawString(40, height - 160, "Bill To:")
    p.setFont("Helvetica", 10)
    p.drawString(60, height - 175, customer.name if customer else "Unknown Customer")
    if customer and customer.phone:
        p.drawString(60, height - 190, f"Phone: {customer.phone}")
    if customer and customer.kra_pin:
        p.drawString(60, height - 205, f"KRA PIN: {customer.kra_pin}")

    # Line Items Table
    y_start = height - 240
    data = [["#", "Description", "Unit Price", "Quantity", "Total"]]
    for i, line in enumerate(invoice.lines, start=1):
        if getattr(line, "product_id", None):
            product = db.query(models.Product).filter_by(id=line.product_id).first()
            description = product.name if product else "Product"
        else:
            description = line.description or "Service"

        data.append([
            str(i),
            description,
            f"KES {line.unit_price:.2f}",
            str(line.quantity),
            f"KES {line.unit_price * line.quantity:.2f}"
        ])

    table = Table(data, colWidths=[20, 255, 80, 60, 80])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
    ]))
    table.wrapOn(p, width, height)
    table_height = 20 * len(data)
    table.drawOn(p, (width - table._width) / 2, y_start - table_height)

    # Totals
    y = y_start - table_height - 30
    p.setFont("Helvetica-Bold", 11)
    totals = [
        ["Subtotal:", f"KES {invoice.amount:.2f}"],
        ["VAT:", f"KES {invoice.vat:.2f}"],
        ["Excise:", f"KES {invoice.excise:.2f}"],
        ["Grand Total:", f"KES {invoice.amount + invoice.vat + invoice.excise:.2f}"],
    ]
    for label, value in totals:
        p.drawString(350, y, label)
        p.drawRightString(width - 40, y, value)
        y -= 15

    # Stamp
    p.setFont("Helvetica-Oblique", 10)
    p.drawString(50, y - 40, "Authorized Stamp:")

    p.showPage()
    p.save()
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"inline; filename=invoice_{invoice_number}.pdf"
    })


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
def update_invoice(invoice_number: str, updated_invoice: InvoiceCreate, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter_by(invoice_number=invoice_number).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    customer = db.query(models.Customer).filter_by(name=updated_invoice.customer_name.strip()).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Remove existing lines
    db.query(models.InvoiceLine).filter_by(invoice_id=invoice.id).delete()

    # Update invoice fields
    total = 0
    for line in updated_invoice.lines:
        if line.type == "Product":
            if not line.product_id or not line.quantity or not line.amount:
                raise HTTPException(status_code=422, detail="Missing product_id, quantity or amount for Product line")
            total += line.quantity * line.amount
        elif line.type == "Service":
            if not line.item or not line.amount:
                raise HTTPException(status_code=422, detail="Missing item or amount for Service line")
            total += line.amount
        else:
            raise HTTPException(status_code=422, detail="Invalid line type")

    invoice.invoice_date = updated_invoice.invoice_date
    invoice.customer_id = customer.id
    invoice.description = updated_invoice.description
    invoice.amount = total
    invoice.vat = updated_invoice.vat
    invoice.excise = updated_invoice.excise

    db.flush()

    # Add new lines
    for line in updated_invoice.lines:
        db_line = models.InvoiceLine(
            invoice_id=invoice.id,
            product_id=line.product_id if line.type == "Product" else None,
            item=line.item,
            description=line.description,
            quantity=line.quantity if line.type == "Product" else 1,
            unit_price=line.unit_price,
            amount=line.amount,
            vat=line.vat,
            excise=line.excise,
            type=line.type
        )
        db.add(db_line)

    db.commit()
    db.refresh(invoice)

    return InvoiceResponse(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        customer_name=customer.name if customer else "Unknown",
        description=invoice.description,
        amount=invoice.amount,
        vat=invoice.vat,
        excise=invoice.excise,
        lines=[
            InvoiceLineResponse(
                id=line.id,
                product_id=line.product_id,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                amount=line.unit_price * line.quantity,
                type="Product" if line.product_id else "Service",
                vat=line.vat if line.vat is not None else 0,
                excise=line.excise if line.excise is not None else 0
            ) for line in invoice.lines
        ]
    )
# -------------------- GET Invoice by Invoice Number (includes lines) --------------------
@router.get("/{invoice_number}", response_model=InvoiceResponse)
def get_invoice(invoice_number: str, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter_by(invoice_number=invoice_number).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    customer = db.query(models.Customer).filter_by(id=invoice.customer_id).first()

    return InvoiceResponse(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        customer_name=customer.name if customer else "Unknown",
        description=invoice.description,
        amount=invoice.amount,
        vat=invoice.vat,
        excise=invoice.excise,
        lines=[
            InvoiceLineResponse(
                id=line.id,
                product_id=line.product_id,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                amount=line.unit_price * line.quantity,
                type="Product" if line.product_id else "Service",
                vat=line.vat if line.vat is not None else 0,
                excise=line.excise if line.excise is not None else 0
            ) for line in invoice.lines
        ]
    )
