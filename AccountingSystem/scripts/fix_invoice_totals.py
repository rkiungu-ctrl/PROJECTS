import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.purchase_invoice import PurchaseInvoice
from models.purchase_invoice_line import PurchaseInvoiceLine
from models.tax import Tax  # Add this import
from database import SessionLocal

db = SessionLocal()

def get_tax_options(db):
    taxes = db.query(Tax).all()
    tax_options = []
    for t in taxes:
        tax_options.append({
            "id": t.id,
            "account_code": t.account_code or "",
            "type": (t.type or "").upper(),
            "rate": float(t.rate or 0),
            "code": t.account_code or "",
            "label": f"{t.type} {int(float(t.rate or 0) * 100)}%"
        })
    return tax_options

def find_rate(tax_options, type_name, code_or_label):
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

        excise_code = getattr(ln, "excise_code", None)
        vat_code = getattr(ln, "vat_code", None)

        excise_amount = 0.0
        if excise_code:
            excise_rate = find_rate(tax_options, "EXCISE", excise_code)
            if excise_rate:
                excise_amount = base * excise_rate

        vat_amount = 0.0
        if vat_code:
            vat_rate = find_rate(tax_options, "VAT", vat_code)
            if vat_rate:
                vat_amount = (base + excise_amount) * vat_rate

        if getattr(ln, "type", "") == "Discount":
            total -= base
        else:
            total += base  # Always add base amount
            if excise_amount:
                total += excise_amount
            if vat_amount:
                total += vat_amount
    return total

invoices = db.query(PurchaseInvoice).all()
tax_options = get_tax_options(db)

for inv in invoices:
    lines = db.query(PurchaseInvoiceLine).filter(PurchaseInvoiceLine.purchase_invoice_id == inv.id).all()
    inv.total_amount = round(calculate_invoice_total(lines, tax_options), 1)
db.commit()
db.close()