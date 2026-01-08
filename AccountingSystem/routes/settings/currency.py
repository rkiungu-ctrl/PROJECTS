from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from database import get_db
from models.currency import Currency
from schemas.currency import CurrencyCreate, CurrencyUpdate, CurrencyOut

router = APIRouter(prefix="/currencies", tags=["Accounting"])

@router.get("/", response_model=List[CurrencyOut])
def list_currencies(db: Session = Depends(get_db), active: bool | None = None):
    q = db.query(Currency)
    if active is not None:
        q = q.filter(Currency.active == active)
    rows = q.order_by(func.lower(Currency.code)).all()
    # explicit dicts to avoid any serialization surprises
    return [
        {
            "id": r.id,
            "code": r.code or "",
            "name": r.name or "",
            "symbol": r.symbol,
            "decimal_places": int(r.decimal_places or 2),
            "rate_to_base": float(r.rate_to_base or 1),
            "is_base": bool(r.is_base),
            "active": bool(r.active),
        }
        for r in rows
    ]

@router.post("/", response_model=CurrencyOut)
def create_currency(payload: CurrencyCreate, db: Session = Depends(get_db)):
    code = (payload.code or "").strip().upper()
    name = (payload.name or "").strip()
    symbol = (payload.symbol or "").strip() or None

    if not code or not name:
        raise HTTPException(status_code=400, detail="Code and Name are required")

    dup = db.query(Currency).filter(func.upper(Currency.code) == code).first()
    if dup:
        raise HTTPException(status_code=409, detail="Currency code already exists")

    cur = Currency(
        code=code,
        name=name,
        symbol=symbol,
        decimal_places=int(payload.decimal_places or 2),
        rate_to_base=Decimal(str(payload.rate_to_base or 1)),
        is_base=bool(payload.is_base),
        active=bool(payload.active),
    )

    # If user marks this as base, unset previous base
    if cur.is_base:
        prev = db.query(Currency).filter(Currency.is_base == True).first()
        if prev:
            prev.is_base = False
        cur.rate_to_base = Decimal("1")

    try:
        db.add(cur)
        db.commit()
        db.refresh(cur)
        return cur
    except IntegrityError as e:
        db.rollback()
        # handle unique(code) and unique(is_base true) gracefully
        msg = "Could not save currency"
        if "UNIQUE constraint failed: currencies.code" in str(e.orig):
            msg = "Currency code already exists"
        if "ix_currencies_one_base" in str(e.orig):
            msg = "Only one base currency is allowed"
        raise HTTPException(status_code=409, detail=msg)

@router.put("/{currency_id}", response_model=CurrencyOut)
def update_currency(currency_id: int, payload: CurrencyUpdate, db: Session = Depends(get_db)):
    cur = db.query(Currency).get(currency_id)
    if not cur:
        raise HTTPException(404, "Not found")

    data = payload.dict(exclude_unset=True)
    if "code" in data:
        new_code = (data["code"] or "").strip().upper()
        if not new_code:
            raise HTTPException(400, "Code cannot be blank")
        if db.query(Currency).filter(Currency.code == new_code, Currency.id != cur.id).first():
            raise HTTPException(400, "Currency code already exists")
        cur.code = new_code

    if "name" in data:
        nm = (data["name"] or "").strip()
        if not nm:
            raise HTTPException(400, "Name cannot be blank")
        cur.name = nm

    if "symbol" in data:
        cur.symbol = (data["symbol"] or "").strip() or None
    if "decimal_places" in data:
        cur.decimal_places = int(data["decimal_places"])
    if "rate_to_base" in data:
        cur.rate_to_base = data["rate_to_base"]
    if "active" in data:
        cur.active = bool(data["active"])

    db.commit(); db.refresh(cur)
    return cur

@router.delete("/{currency_id}")
def delete_currency(currency_id: int, db: Session = Depends(get_db)):
    cur = db.query(Currency).get(currency_id)
    if not cur:
        raise HTTPException(404, "Not found")
    if cur.is_base:
        raise HTTPException(400, "Cannot delete base currency")
    db.delete(cur); db.commit()
    return {"deleted": True}

@router.post("/{currency_id}/set_base", response_model=CurrencyOut)
def set_base_currency(currency_id: int, db: Session = Depends(get_db)):
    cur = db.query(Currency).get(currency_id)
    if not cur:
        raise HTTPException(404, "Not found")
    prev = db.query(Currency).filter(Currency.is_base == True).first()
    if prev and prev.id != cur.id:
        prev.is_base = False
    cur.is_base = True
    cur.rate_to_base = 1
    db.commit(); db.refresh(cur)
    return cur
