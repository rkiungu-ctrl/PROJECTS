from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from typing import List
import io
import csv
from sqlalchemy import func

from database import get_db
import models
from schemas.product import ProductCreate, ProductOut

router = APIRouter(
    prefix="/products",
    tags=["Inventory"]
)


@router.post("/", response_model=dict)
def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db)
):
    # If SKU is not provided, generate a unique one
    if not product.sku:
        company_initials = "ABC"  # Replace with your logic if needed
        next_number = 1
        while True:
            candidate_sku = f"{company_initials}{next_number:03d}"
            existing = db.query(models.Product).filter_by(sku=candidate_sku).first()
            if not existing:
                product.sku = candidate_sku
                break
            next_number += 1
    else:
        existing = db.query(models.Product).filter_by(sku=product.sku).first()
        if existing:
            raise HTTPException(status_code=400, detail="Product with this SKU already exists")

    new_product = models.Product(
        name=product.name,
        sku=product.sku,
        unit_price=product.unit_price,
        unit_of_measure=product.unit_of_measure,
        opening_stock=product.opening_stock,
        is_service=product.is_service
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return {"message": "Product added successfully", "product_id": new_product.id}


@router.get("/", response_model=List[ProductOut])
def get_products(
    db: Session = Depends(get_db)
):
    products = db.query(models.Product).all()
    output = []

    for p in products:
        in_qty = sum(s.quantity for s in p.stock_entries if s.type.upper() == "IN")
        out_qty = sum(s.quantity for s in p.stock_entries if s.type.upper() == "OUT")
        balance = (p.opening_stock or 0) + in_qty - out_qty
        total_cost = (p.unit_price or 0) * balance
        average_cost = (p.unit_price or 0)  # You can update this logic as needed

        output.append(ProductOut(
            id=p.id,
            name=p.name,
            sku=p.sku,
            unit_price=p.unit_price,
            unit_of_measure=p.unit_of_measure,
            opening_stock=p.opening_stock,
            is_service=p.is_service,
            current_stock=balance,
            average_cost=average_cost,
            total_cost=total_cost
        ))

    return output


@router.get("/{product_id}/ledger")
def get_product_ledger(
    product_id: int = Path(...),
    db: Session = Depends(get_db)
):
    product = db.query(models.Product).filter_by(id=product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    entries = (
        db.query(models.StockEntry)
        .filter_by(product_id=product_id)
        .order_by(models.StockEntry.date, models.StockEntry.id)
        .all()
    )

    balance = product.opening_stock
    ledger = []

    for entry in entries:
        if entry.type.upper() == "IN":
            balance += entry.quantity
        elif entry.type.upper() == "OUT":
            balance -= entry.quantity

        ledger.append({
            "date": entry.date,
            "type": entry.type,
            "reference": entry.reference,
            "quantity": entry.quantity,
            "remarks": entry.remarks,
            "balance": balance
        })

    return {
        "product": {
            "id": product.id,
            "name": product.name,
            "sku": product.sku
        },
        "ledger": ledger
    }


@router.get("/low-stock/")
def get_low_stock_products(
    threshold: float = 5,
    db: Session = Depends(get_db)
):
    products = db.query(models.Product).all()
    low_stock = []

    for p in products:
        in_qty = sum(s.quantity for s in p.stock_entries if s.type.upper() == "IN")
        out_qty = sum(s.quantity for s in p.stock_entries if s.type.upper() == "OUT")
        balance = p.opening_stock + in_qty - out_qty

        if balance < threshold:
            low_stock.append({
                "id": p.id,
                "name": p.name,
                "sku": p.sku,
                "current_stock": balance
            })

    return low_stock


@router.get("/export/csv")
def export_products_csv(
    db: Session = Depends(get_db)
):
    products = db.query(models.Product).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Name", "SKU", "Unit Price", "Unit", "Current Stock", "Is Service"])

    for p in products:
        in_qty = sum(s.quantity for s in p.stock_entries if s.type.upper() == "IN")
        out_qty = sum(s.quantity for s in p.stock_entries if s.type.upper() == "OUT")
        balance = p.opening_stock + in_qty - out_qty

        writer.writerow([
            p.id,
            p.name,
            p.sku,
            p.unit_price,
            p.unit_of_measure,
            balance,
            "Yes" if p.is_service else "No"
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=products.csv"}
    )
