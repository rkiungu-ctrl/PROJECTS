# routes/activity.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Literal, Optional
from datetime import datetime

from database import get_db
import models  # assumes you already have models.Invoice, models.PaymentReceipt, models.Purchase, models.SupplierPayment

router = APIRouter(prefix="/activity", tags=["Activity"])

ActivityType = Literal["invoice", "receipt", "purchase", "payment"]

def _safe_dt(value) -> datetime:
    if isinstance(value, datetime):
        return value
    try:
        # handle date / str → datetime
        if hasattr(value, "isoformat"):
            return datetime.fromisoformat(value.isoformat())
        if isinstance(value, str):
            return datetime.fromisoformat(value)
    except Exception:
        pass
    return datetime.min

@router.get("/recent")
def recent_activity(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    username: Optional[str] = None,  # kept for parity with your other endpoints
    password: Optional[str] = None,
):
    items: List[dict] = []

    # ---- Invoices
    try:
        invs = (
            db.query(models.Invoice)
            .order_by(models.Invoice.invoice_date.desc())
            .limit(limit)
            .all()
        )
        for inv in invs:
            items.append({
                "type": "invoice",
                "ref": getattr(inv, "invoice_number", None),
                "date": getattr(inv, "invoice_date", None),
                "amount": float(getattr(inv, "amount", 0) or 0),
                "party": getattr(inv, "customer_name", None) or getattr(getattr(inv, "customer", None), "name", None),
                "narration": getattr(inv, "description", "") or "Invoice issued",
            })
    except Exception:
        pass

    # ---- Receipts
    try:
        recs = (
            db.query(models.PaymentReceipt)
            .order_by(models.PaymentReceipt.date.desc())
            .limit(limit)
            .all()
        )
        for r in recs:
            items.append({
                "type": "receipt",
                "ref": getattr(r, "reference", None) or getattr(r, "id", None),
                "date": getattr(r, "date", None),
                "amount": float(getattr(r, "amount", 0) or 0),
                "party": getattr(r, "customer_name", None) or getattr(getattr(r, "customer", None), "name", None),
                "narration": getattr(r, "narration", "") or "Receipt recorded",
            })
    except Exception:
        pass

    # ---- Purchases
    try:
        purch = (
            db.query(models.Purchase)
            .order_by(models.Purchase.purchase_date.desc())
            .limit(limit)
            .all()
        )
        for p in purch:
            items.append({
                "type": "purchase",
                "ref": getattr(p, "purchase_number", None) or getattr(p, "id", None),
                "date": getattr(p, "purchase_date", None),
                "amount": float(getattr(p, "amount", 0) or 0),
                "party": getattr(p, "supplier_name", None) or getattr(getattr(p, "supplier", None), "name", None),
                "narration": getattr(p, "description", "") or "Purchase recorded",
            })
    except Exception:
        pass

    # ---- Supplier Payments
    try:
        pays = (
            db.query(models.SupplierPayment)
            .order_by(models.SupplierPayment.date.desc())
            .limit(limit)
            .all()
        )
        for s in pays:
            items.append({
                "type": "payment",
                "ref": getattr(s, "reference", None) or getattr(s, "id", None),
                "date": getattr(s, "date", None),
                "amount": float(getattr(s, "amount", 0) or 0),
                "party": getattr(s, "supplier_name", None) or getattr(getattr(s, "supplier", None), "name", None),
                "narration": getattr(s, "narration", "") or "Supplier payment",
            })
    except Exception:
        pass

    # Normalize + sort by date desc, then trim to the requested limit
    for i in items:
        i["date"] = _safe_dt(i.get("date"))

    items.sort(key=lambda x: x["date"], reverse=True)
    trimmed = items[:limit]

    # Convert datetime to isoformat for JSON
    for i in trimmed:
        i["date"] = i["date"].date().isoformat()  # e.g., "2025-09-02"

    return {"items": trimmed}
