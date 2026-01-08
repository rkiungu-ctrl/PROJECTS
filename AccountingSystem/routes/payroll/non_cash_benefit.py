from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
import models
from schemas.non_cash_benefit import EmployeeNonCashBenefitCreate, EmployeeNonCashBenefitOut

router = APIRouter(prefix="/non-cash-benefits", tags=["non_cash_benefits"])

@router.post("/", response_model=EmployeeNonCashBenefitOut)
def create_non_cash_benefit(item: EmployeeNonCashBenefitCreate, db: Session = Depends(get_db)):
    # Allow either staff_no or employee_id
    new = models.EmployeeNonCashBenefit(
        employee_id=item.employee_id,
        staff_no=item.staff_no,
        period=item.period,
        amount=float(item.amount or 0.0),
        note=item.note
    )
    db.add(new)
    db.commit()
    db.refresh(new)
    return new

@router.get("/", response_model=List[EmployeeNonCashBenefitOut])
def list_non_cash_benefits(staff_no: Optional[str] = None, period: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.EmployeeNonCashBenefit)
    if staff_no:
        q = q.filter(models.EmployeeNonCashBenefit.staff_no == staff_no)
    if period:
        try:
            from datetime import datetime
            p = datetime.strptime(period, "%Y-%m-%d").date()
            q = q.filter(models.EmployeeNonCashBenefit.period == p)
        except Exception:
            pass
    return q.order_by(models.EmployeeNonCashBenefit.date_created.desc()).all()

@router.delete("/{item_id}")
def delete_non_cash_benefit(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.EmployeeNonCashBenefit).filter(models.EmployeeNonCashBenefit.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(item)
    db.commit()
    return {"deleted": True}
