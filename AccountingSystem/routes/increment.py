from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.increment import Increment
from models.employee import Employee
from schemas.increment import IncrementCreate, IncrementSchema
from typing import List
from datetime import date

router = APIRouter(prefix="/employees", tags=["Increments"])

@router.get("/{staff_no}/increments", response_model=List[IncrementSchema])
def get_increments(staff_no: str, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee.increments

@router.post("/{staff_no}/increments", response_model=IncrementSchema)
def add_increment(staff_no: str, inc: IncrementCreate, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    increment = Increment(employee_id=employee.id, **inc.dict())
    db.add(increment)
    db.commit()
    db.refresh(increment)
    return increment

@router.put("/increments/{inc_id}", response_model=IncrementSchema)
def update_increment(inc_id: int, inc: IncrementCreate, db: Session = Depends(get_db)):
    increment = db.query(Increment).filter(Increment.id == inc_id).first()
    if not increment:
        raise HTTPException(status_code=404, detail="Increment not found")
    increment.start_date = inc.start_date
    increment.gross_pay = inc.gross_pay
    db.commit()
    db.refresh(increment)
    return increment

@router.delete("/increments/{inc_id}", response_model=dict)
def delete_increment(inc_id: int, db: Session = Depends(get_db)):
    increment = db.query(Increment).filter(Increment.id == inc_id).first()
    if not increment:
        raise HTTPException(status_code=404, detail="Increment not found")
    db.delete(increment)
    db.commit()
    return {"detail": "Increment deleted"}