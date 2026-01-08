from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from database import get_db
from models.tax import Tax
from schemas.tax import TaxCreate, TaxOut
from models.account import Account

router = APIRouter(prefix="/taxes", tags=["Taxes"])

# Create new tax rate
@router.post("/", response_model=TaxOut)
def create_tax(tax: TaxCreate, db: Session = Depends(get_db)):
        account = db.query(Account).filter(Account.account_code == tax.account_code).first()
        if not account:
            raise HTTPException(status_code=400, detail="Invalid account code")

        new_tax = Tax(**tax.dict())
        db.add(new_tax)
        db.commit()
        db.refresh(new_tax)
        return new_tax

# Get all taxes
@router.get("/", response_model=List[TaxOut])
def get_all_taxes(db: Session = Depends(get_db)):
    return db.query(Tax).all()

# Get taxes valid for a given date
@router.get("/active", response_model=List[TaxOut])
def get_active_taxes(date: date = Query(...), db: Session = Depends(get_db)):
    return db.query(Tax).filter(
        Tax.start_date <= date,
        (Tax.end_date == None) | (Tax.end_date >= date)
    ).all()

# ----------------- DELETE a tax -----------------
@router.delete("/{tax_id}")
def delete_tax(tax_id: int, db: Session = Depends(get_db)):
    tax = db.query(Tax).filter(Tax.id == tax_id).first()
    if not tax:
        raise HTTPException(status_code=404, detail="Tax not found")
    db.delete(tax)
    db.commit()
    return {"message": "Tax deleted"}


# ----------------- UPDATE a tax -----------------
@router.put("/{tax_id}", response_model=TaxOut)
def update_tax(tax_id: int, updated_tax: TaxCreate, db: Session = Depends(get_db)):
    tax = db.query(Tax).filter(Tax.id == tax_id).first()
    if not tax:
        raise HTTPException(status_code=404, detail="Tax not found")
    
    for key, value in updated_tax.dict(exclude_unset=True).items():
        setattr(tax, key, value)

    db.commit()
    db.refresh(tax)
    return tax