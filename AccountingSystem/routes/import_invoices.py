from fastapi import APIRouter, File, UploadFile, Depends, HTTPException
from sqlalchemy.orm import Session
from io import BytesIO
from datetime import datetime, date
import pandas as pd
import re

from database import get_db
from models.customer import Customer
from models.invoice import Invoice
from models.invoice_line import InvoiceLine

# If your Tax model is elsewhere, adjust this import:
try:
    from models.tax import Tax
except Exception:  # pragma: no cover
    from models import Tax  # type: ignore

router = APIRouter(prefix="/invoices", tags=["Invoicing"])

# ---------- helpers ----------
def r1(x):
    try:
        return round(float(x or 0) * 10) / 10.0
    except Exception:
        return 0.0

def num(x, default=0.0):
    try:
        if x is None:
            return default
        if isinstance(x, float) and pd.isna(x):
            return default
        return float(str(x).replace(",", "").strip())
    except Exception:
        return default

def norm_header(name: str) -> str:
    s = str(name or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

def norm_code(v) -> str:
    """Normalize tax codes; handle 2252.0 => 2252, remove punctuation, uppercase."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return str(int(v))
    s = str(v).strip()
    m = re.fullmatch(r"(\d+)\.0+", s)
    if m:
        s = m.group(1)
    s = re.sub(r"[^A-Za-z0-9]", "", s).upper()
    return s

def parse_date(val):
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        s = val.strip()
        for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(s, fmt).date()
            except Exception:
                pass
    return None

def first(row: dict, *keys):
    for k in keys:
        if k in row:
            v = row[k]
            if v is not None and not (isinstance(v, float) and pd.isna(v)) and str(v).strip() != "":
                return v
    return None

def parse_client_number(v):
    digits = re.sub(r"[^0-9]", "", str(v or ""))
    return int(digits) if digits else None

class TaxIndex:
    """Date-aware lookup on (TYPE, CODE) with normalization."""
    def __init__(self, rows):
        self.map = {}
        for t in rows:
            ttype = (getattr(t, "type", "") or "").strip().upper()
            code  = norm_code(getattr(t, "account_code", "") or "")
            if not ttype or not code:
                continue
            self.map.setdefault((ttype, code), []).append(t)

    def rate(self, ttype: str, code: str, on_date: date) -> float:
        if not ttype or not code:
            return 0.0
        key = (ttype.strip().upper(), norm_code(code))
        rows = self.map.get(key, [])
        if not rows:
            return 0.0
        d = on_date or date.today()
        for t in rows:
            s = getattr(t, "start_date", None)
            e = getattr(t, "end_date", None)
            if (not s or s <= d) and (not e or d <= e):
                try:
                    return float(t.rate or 0.0)
                except Exception:
                    return 0.0
        try:
            return float(rows[0].rate or 0.0)
        except Exception:
            return 0.0

HAS_SERVICE_ITEM_COL = hasattr(InvoiceLine, "service_item")
HAS_VAT_CODE_COL = hasattr(InvoiceLine, "vat_code")
HAS_EXCISE_CODE_COL = hasattr(InvoiceLine, "excise_code")

# ---------- importer ----------
@router.post("/import")
async def import_invoices(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(status_code=400, detail="Only .csv or .xlsx files are allowed")

    content = await file.read()

    # Force key columns to TEXT so we don't get 2252.0 or lose leading zeros
    dtypes = {
        "client_number": str,
        "cu_inv_number": str,
        "vat_code": str,
        "excise_code": str,
    }

    if ext == "csv":
        df = pd.read_csv(BytesIO(content), dtype=dtypes)
    else:
        df = pd.read_excel(BytesIO(content), dtype=dtypes)

    # Normalize headers
    df.columns = [norm_header(c) for c in df.columns]
    headers = set(df.columns)

    # Required headers
    for col in ("invoice_number", "invoice_date", "client_number"):
        if col not in headers:
            raise HTTPException(status_code=400, detail=f"Missing required column: {col}")

    rows = df.to_dict(orient="records")
    tax_index = TaxIndex(db.query(Tax).all())

    # Group by invoice_number (fallback to 'reference')
    groups = {}
    for r in rows:
        inv_no = str(first(r, "invoice_number", "reference") or "").strip()
        if inv_no:
            groups.setdefault(inv_no, []).append(r)

    if not groups:
        raise HTTPException(status_code=400, detail="No invoice_number/reference values found in file")

    created, updated = 0, 0
    unmatched_client_numbers = []

    for inv_no, lines in groups.items():
        head = lines[0]
        inv_date = parse_date(first(head, "invoice_date")) or date.today()
        cu_inv_number = first(head, "cu_inv_number") or ""
        header_desc = str(first(head, "description") or "")

        # Client strictly by client_number (do not skip if unmatched)
        cust_no = parse_client_number(first(head, "client_number"))
        customer = db.query(Customer).filter(Customer.client_number == cust_no).first() if cust_no is not None else None
        if not customer:
            unmatched_client_numbers.append(first(head, "client_number"))

        # Upsert invoice
        invoice = db.query(Invoice).filter(Invoice.invoice_number == inv_no).first()
        if invoice:
            updated += 1
            db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice.id).delete()
            invoice.invoice_date = inv_date
            invoice.customer_id = customer.id if customer else None
            invoice.description = header_desc
            invoice.cu_inv_number = str(cu_inv_number or "")
            invoice.amount = 0.0
            invoice.vat = 0.0
            invoice.excise = 0.0
        else:
            created += 1
            invoice = Invoice(
                customer_id=customer.id if customer else None,
                invoice_number=inv_no,
                invoice_date=inv_date,
                description=header_desc,
                cu_inv_number=str(cu_inv_number or ""),
                amount=0.0, vat=0.0, excise=0.0,
                source="import",
            )
            db.add(invoice)
            db.flush()

        if not customer and hasattr(invoice, "remarks"):
            invoice.remarks = f"Unmatched client_number: {first(head, 'client_number')}"

        subtotal = 0.0
        exc_total = 0.0
        vat_total = 0.0

        for r in lines:
            ltype = str(first(r, "type") or "Service").strip() or "Service"
            qty = num(first(r, "quantity"), 1.0)

            # Unit price (fallback to legacy 'amount' meaning unit_price)
            unit_price = first(r, "unit_price", "unitprice", "price", "rate")
            if unit_price is None:
                unit_price = first(r, "amount")
            unit_price_val = num(unit_price, 0.0)
            base = r1(qty * unit_price_val)

            # Numeric VAT/Excise if supplied; else compute from codes
            vat_val = first(r, "line_vat", "vat", "vat_amount", "vat_amt", "vatamount")
            exc_val = first(r, "line_excise", "excise", "excise_amount", "excise_amt", "exciseamount")

            vat_code_sheet = norm_code(first(r, "vat_code", "vatcode"))
            exc_code_sheet = norm_code(first(r, "excise_code", "excisecode"))

            if vat_val is None and exc_val is None:
                ex_rate = tax_index.rate("EXCISE", exc_code_sheet, inv_date) if exc_code_sheet else 0.0
                ex_amt = r1(base * ex_rate)
                va_rate = tax_index.rate("VAT", vat_code_sheet, inv_date) if vat_code_sheet else 0.0
                va_amt = r1((base + ex_amt) * va_rate)
            else:
                ex_amt = r1(num(exc_val, 0.0))
                va_amt = r1(num(vat_val, 0.0))

            line_total = r1(base + ex_amt + va_amt)

            # service_item -> display text for Service rows
            service_item = first(r, "service_item", "service", "serviceitem", "service_item_name", "service_description", "service_desc")
            item = first(r, "item", "line_item")
            if ltype.lower().startswith("serv"):
                item_text = (str(service_item).strip() if service_item not in (None, "", "nan") else None) or \
                            (str(item).strip() if item not in (None, "", "nan") else None) or "Service"
            else:
                item_text = (str(item).strip() if item not in (None, "", "nan") else "") or \
                            (str(service_item).strip() if service_item not in (None, "", "nan") else "")

            desc_text = str(first(r, "line_description", "description") or "")

            product_id = first(r, "product_id")
            try:
                product_id = int(product_id) if product_id not in (None, "", "nan") else None
            except Exception:
                product_id = None

            kwargs = dict(
                invoice_id=invoice.id,
                product_id=product_id if ltype.lower().startswith("prod") else None,
                item=item_text,
                description=desc_text,
                quantity=r1(qty),
                unit_price=r1(unit_price_val),
                amount=r1(line_total),
                vat=r1(va_amt),
                excise=r1(ex_amt),
                type=ltype,
            )
            if HAS_SERVICE_ITEM_COL:
                kwargs["service_item"] = (str(service_item).strip() if service_item not in (None, "", "nan") else None) \
                    if ltype.lower().startswith("serv") else None
            if HAS_VAT_CODE_COL:
                kwargs["vat_code"] = vat_code_sheet or None
            if HAS_EXCISE_CODE_COL:
                kwargs["excise_code"] = exc_code_sheet or None

            db.add(InvoiceLine(**kwargs))

            subtotal = r1(subtotal + base)
            exc_total = r1(exc_total + ex_amt)
            vat_total = r1(vat_total + va_amt)

        # Header totals (amount = Sub-total)
        invoice.amount = r1(subtotal)
        invoice.excise = r1(exc_total)
        invoice.vat = r1(vat_total)

        db.flush()

    db.commit()
    return {
        "status": "success",
        "created": created,
        "updated": updated,
        "unmatched_client_numbers": unmatched_client_numbers,
        "message": f"Invoices created: {created}, updated: {updated}, unmatched clients: {len(unmatched_client_numbers)}"
    }
