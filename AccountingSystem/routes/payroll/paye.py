from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import pandas as pd
from io import BytesIO
from models.paye import PayeBand, PayeTable
from schemas.paye import PayeBandIn

router = APIRouter(prefix="/payroll-settings/paye", tags=["Payroll Settings"])

@router.post("/import")
async def import_paye_bands(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content))
    except Exception:
        df = pd.read_csv(BytesIO(content), encoding="utf-8")
    df.columns = [c.strip().lower() for c in df.columns]
    required = {"lower", "upper", "rate"}
    if not required.issubset(set(df.columns)):
        raise HTTPException(400, "Missing required columns: lower, upper, rate")
    bands = []
    for _, row in df.iterrows():
        band = PayeBand(
            lower=float(str(row["lower"]).replace(",", "")),
            upper=float(str(row["upper"]).replace(",", "")) if pd.notnull(row["upper"]) else None,
            rate=float(str(row["rate"]).replace(",", "")) / 100  # convert percent to decimal
        )
        db.add(band)
        bands.append(band)
    db.commit()
    return {"imported": len(bands)}