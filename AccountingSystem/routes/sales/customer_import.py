import pandas as pd
from fastapi import APIRouter, File, UploadFile, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.customer import Customer

router = APIRouter(prefix="/customer_import", tags=["Customers"])

@router.post("/upload")
def import_customers(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(file.file)
        elif file.filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(file.file)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload a CSV or Excel file.")

        required_columns = {"client_number", "name", "phone", "email", "kra_pin", "address"}
        if not required_columns.issubset(df.columns):
            raise HTTPException(status_code=400, detail=f"Missing required columns. Expected: {required_columns}")

        created = 0
        skipped = 0

        for _, row in df.iterrows():
            if db.query(Customer).filter(Customer.client_number == row["client_number"]).first():
                skipped += 1
                continue  # Skip duplicate

            customer = Customer(
                client_number=row["client_number"],
                name=row["name"],
                phone=row["phone"],
                email=row["email"],
                kra_pin=row["kra_pin"],
                address=row["address"]
            )
            db.add(customer)
            created += 1

        db.commit()
        return {"message": f"Import completed: {created} created, {skipped} skipped (duplicates)."}

    except Exception as e:
        print("Import error:", e)  # Add this line for debugging
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
