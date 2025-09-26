from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.stock_entry import StockEntry
from models.product import Product
from schemas.stock_entry import StockEntryCreate

router = APIRouter(
    prefix="/stock",
    tags=["Inventory"]
)

@router.post("/add")
def add_stock_entry(
    entry: StockEntryCreate,
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(Product.id == entry.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    stock_entry = StockEntry(
        product_id=entry.product_id,
        quantity=entry.quantity,
        type=entry.type,
        date=entry.date,
        reference=entry.reference
    )
    db.add(stock_entry)

    if entry.type == "IN":
        product.quantity += entry.quantity
    elif entry.type == "OUT":
        if product.quantity < entry.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock")
        product.quantity -= entry.quantity

    db.commit()
    db.refresh(stock_entry)
    return stock_entry


@router.get("/history/{product_id}")
def get_stock_history(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    entries = db.query(StockEntry).filter(
        StockEntry.product_id == product_id
    ).order_by(StockEntry.date.desc()).all()

    return entries
