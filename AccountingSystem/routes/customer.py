from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.customer import Customer
from schemas.customer import CustomerCreate, CustomerOut

router = APIRouter(prefix="/customers", tags=["Customers"])

@router.get("/", response_model=list[CustomerOut])
def get_customers(db: Session = Depends(get_db)):
    return db.query(Customer).all()

@router.post("/", response_model=CustomerOut)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    new_customer = Customer(**customer.dict())
    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)
    return new_customer

@router.delete("/{id}")
def delete_customer(id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return {"message": "Customer deleted"}

@router.put("/{id}", response_model=CustomerOut)
def update_customer(id: int, customer_update: CustomerCreate, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    for field, value in customer_update.dict().items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)
    return customer
