from fastapi import APIRouter, File, UploadFile, Depends, HTTPException
from sqlalchemy.orm import Session
from io import BytesIO
import pandas as pd

from database import get_db
from models.customer import Customer
from models.invoice import Invoice

router = APIRouter(
    prefix="/invoices",
    tags=["Invoicing"]
)

@router.post("/import")
async def import_invoices(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    ext = file.filename.split('.')[-1]
    if ext not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="Only .csv or .xlsx files are allowed")

    content = await file.read()
    df = pd.read_csv(BytesIO(content)) if ext == "csv" else pd.read_excel(BytesIO(content))

    required = ["invoice_number", "invoice_date", "amount", "description", "client_number"]
    for col in required:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing required column: {col}")

    for _, row in df.iterrows():
        client_number = str(row["client_number"]).strip()
        customer = db.query(Customer).filter(Customer.client_number == client_number).first()
        if not customer:
            raise HTTPException(status_code=400, detail=f"Customer not found with client_number: {client_number}")

        invoice = Invoice(
            customer_id=customer.id,
            invoice_number=row["invoice_number"],
            invoice_date=row["invoice_date"],
            description=row["description"],
            amount=row["amount"],
            vat=row.get("VAT", 0) or 0,
            excise=row.get("Excise", 0) or 0,
            source="import"
        )
        db.add(invoice)

    db.commit()
    return {"status": "success", "message": "Invoices imported"}
