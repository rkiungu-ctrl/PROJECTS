# routes/supplier.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List
from pydantic import BaseModel


from database import get_db
from models import Supplier, PurchaseInvoice, PurchaseInvoiceLine
from schemas.supplier import SupplierCreate, SupplierUpdate

# --- Supplier code generator ---
def generate_supplier_code(db: Session) -> str:
    """
    Auto-generate supplier codes like SUP0001, SUP0002, ...
    """
    last = (
        db.query(Supplier)
        .filter(Supplier.supplier_code != None)  # noqa: E711
        .order_by(Supplier.supplier_code.desc())
        .first()
    )
    if not last or not last.supplier_code:
        return "SUP0001"

    code = last.supplier_code
    try:
        num = int(code.replace("SUP", ""))  # handle 'SUP0001'
    except ValueError:
        num = 0
    return f"SUP{num + 1:04d}"


router = APIRouter(
    prefix="/suppliers",
    tags=["Suppliers"]
)

# ---------- DTOs ----------
class SupplierBalanceOut(BaseModel):
    id: int
    name: str
    total_invoiced: float
    total_paid: float
    balance: float


# ---------- Create ----------
@router.post("/", response_model=dict)
def create_supplier(
    supplier: SupplierCreate,
    db: Session = Depends(get_db)
):
    existing = db.query(Supplier).filter_by(name=supplier.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Supplier already exists")

    supplier_code = generate_supplier_code(db)

    new_supplier = Supplier(
        supplier_code=supplier_code,
        name=supplier.name,
        pin=supplier.pin,
        contact_person=supplier.contact_person,
        phone=supplier.phone,
        email=supplier.email,
        address=supplier.address,
        bank_name=supplier.bank_name,
        bank_branch=supplier.bank_branch,
        bank_account_number=supplier.bank_account_number,
        bank_branch_code=supplier.bank_branch_code
    )
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    return {"message": "Supplier added successfully", "supplier_id": new_supplier.id}


# ---------- List (with per-supplier payable balance) ----------
@router.get("/", response_model=List[dict])
def list_suppliers(db: Session = Depends(get_db)):
    inv_subq = (
        db.query(
            PurchaseInvoice.supplier_id.label("supplier_id"),
            func.COALESCE(func.SUM(PurchaseInvoice.total_amount), 0.0).label("total_invoiced"),
        )
        .group_by(PurchaseInvoice.supplier_id)
        .subquery()
    )

    paid_subq = (
        db.query(
            PurchaseInvoice.supplier_id.label("supplier_id"),
            func.COALESCE(func.SUM(PurchaseInvoice.amount_paid), 0.0).label("total_paid"),
        )
        .group_by(PurchaseInvoice.supplier_id)
        .subquery()
    )

    rows = (
        db.query(
            Supplier,
            func.COALESCE(inv_subq.c.total_invoiced, 0.0).label("total_invoiced"),
            func.COALESCE(paid_subq.c.total_paid, 0.0).label("total_paid"),
        )
        .outerjoin(inv_subq, inv_subq.c.supplier_id == Supplier.id)
        .outerjoin(paid_subq, paid_subq.c.supplier_id == Supplier.id)
        .all()
    )

    def fmt(n: float) -> str:
        return f"{float(n or 0.0):,.2f}"

    out: List[dict] = []
    for s, total_invoiced, total_paid in rows:
        invd = float(total_invoiced or 0.0)
        paid = float(total_paid or 0.0)
        balance = invd - paid
        out.append({
            "id": s.id,
            "name": s.name,
            "pin": s.pin,
            "contact_person": s.contact_person,
            "phone": s.phone,
            "email": s.email,
            "address": s.address,
            "bank_name": s.bank_name,
            "bank_branch": s.bank_branch,
            "bank_account_number": s.bank_account_number,
            "bank_branch_code": s.bank_branch_code,
            "supplier_code": getattr(s, "supplier_code", None),

            # numeric fields
            "total_invoiced": invd,
            "total_paid": paid,
            "payable_balance": balance,
            "balance": balance,        # alias
            "balance_due": balance,    # alias
        })
    return out


# ---------- Balances summary ----------
@router.get("/suppliers_with_balances/", response_model=List[SupplierBalanceOut])
def suppliers_with_balances(db: Session = Depends(get_db)):
    # Sum invoice totals per supplier
    inv_subq = (
        db.query(
            PurchaseInvoice.supplier_id.label("supplier_id"),
            func.COALESCE(func.SUM(PurchaseInvoice.total_amount), 0.0).label("total_invoiced"),
        )
        .group_by(PurchaseInvoice.supplier_id)
        .subquery()
    )

    # Sum amount_paid per supplier
    paid_subq = (
        db.query(
            PurchaseInvoice.supplier_id.label("supplier_id"),
            func.COALESCE(func.SUM(PurchaseInvoice.amount_paid), 0.0).label("total_paid"),
        )
        .group_by(PurchaseInvoice.supplier_id)
        .subquery()
    )

    rows = (
        db.query(
            Supplier.id,
            Supplier.name,
            func.COALESCE(inv_subq.c.total_invoiced, 0.0).label("total_invoiced"),
            func.COALESCE(paid_subq.c.total_paid, 0.0).label("total_paid"),
        )
        .outerjoin(inv_subq, inv_subq.c.supplier_id == Supplier.id)
        .outerjoin(paid_subq, paid_subq.c.supplier_id == Supplier.id)
        .all()
    )

    out: List[SupplierBalanceOut] = []
    for sid, name, total_invoiced, total_paid in rows:
        invd = float(total_invoiced or 0.0)
        paid = float(total_paid or 0.0)
        out.append(SupplierBalanceOut(
            id=sid,
            name=name,
            total_invoiced=invd,
            total_paid=paid,
            balance=invd - paid,
        ))
    return out


# ---------- Update ----------
@router.put("/{supplier_id}")
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db)
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    for key, value in payload.dict(exclude_unset=True).items():
        setattr(supplier, key, value)

    db.commit()
    db.refresh(supplier)
    return supplier


# ---------- Delete ----------
@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    db.delete(supplier)
    db.commit()
    return {"message": "Supplier deleted"}


# ---------- Supplier invoices/payments summary for the modal ----------
@router.get("/{supplier_id}/invoices_summary", response_model=dict)
def supplier_invoices_summary(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    rows = (
        db.query(
            PurchaseInvoice.id,
            PurchaseInvoice.invoice_date,
            PurchaseInvoice.reference,
            PurchaseInvoice.cu_inv_number,
            PurchaseInvoice.total_amount,
            PurchaseInvoice.amount_paid,
            PurchaseInvoice.status,
        )
        .filter(PurchaseInvoice.supplier_id == supplier_id)
        .order_by(PurchaseInvoice.invoice_date.desc().nullslast(), PurchaseInvoice.id.desc())
        .all()
    )

    invoices = []
    total_invoiced = 0.0
    total_paid = 0.0

    for r in rows:
        total = float(r.total_amount or 0.0)
        paid = float(r.amount_paid or 0.0)
        invoices.append({
            "id": r.id,
            "date": r.invoice_date.isoformat() if r.invoice_date else None,
            "reference": r.reference,
            "cu_inv_number": r.cu_inv_number,
            "total": total,
            "amount_paid": paid,
            "balance_due": total - paid,
            "status": r.status,
        })
        total_invoiced += total
        total_paid += paid

    summary = {
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "totals": {
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "balance_due": total_invoiced - total_paid,
        },
        "invoices": invoices,
        "payments": [],   # placeholder for future payments
    }
    return summary


# ---------- Invoices by supplier ----------
def calculate_invoice_total(invoice_id, db):
    # Safe, dependency-free total calculation used only for summaries.
    # Avoid referencing undefined helpers (find_rate, tax_options) here — keep it simple.
    lines = db.query(PurchaseInvoiceLine).filter(PurchaseInvoiceLine.purchase_invoice_id == invoice_id).all()
    total = 0.0
    for ln in lines:
        quantity = float(getattr(ln, 'quantity', 0) or 0)
        unit_price = float(getattr(ln, 'unit_price', 0) or 0)
        base = quantity * unit_price
        total += base
    return total

@router.get("/by_supplier/{supplier_id}", response_model=List[dict])
def purchase_invoices_by_supplier(supplier_id: int, db: Session = Depends(get_db)):
    invoices = (
        db.query(PurchaseInvoice)
        .filter(PurchaseInvoice.supplier_id == supplier_id)
        .order_by(PurchaseInvoice.invoice_date.desc().nullslast(), PurchaseInvoice.id.desc())
        .all()
    )
    out = []
    for inv in invoices:
        total = round(float(inv.total_amount or 0.0), 1)  # Use total_amount directly
        paid = float(inv.amount_paid or 0.0)
        out.append({
            "id": inv.id,
            "date": inv.invoice_date if inv.invoice_date else None,
            "reference": inv.reference,
            "cu_inv_number": inv.cu_inv_number,
            "total": total,
            "amount_paid": paid,
            "balance_due": total - paid,
            "status": inv.status,
        })
    return out

def get_tax_rate(code, type, db):
    if not code:
        return 0.0
    tax = db.execute(
        text("SELECT rate FROM taxes WHERE code = :code AND type = :type"),
        {"code": code, "type": type.upper()}
    ).fetchone()
    return float(tax[0]) if tax else 0.0
