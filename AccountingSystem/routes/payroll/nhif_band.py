from pydantic import BaseModel
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.nhif_band import NHIFBand
from schemas.nhif_band import NHIFBandOut, NHIFBandCreate, NHIFBandUpdate

router = APIRouter(prefix="/payroll-settings/nhif", tags=["Payroll Settings"])

@router.get("/", response_model=list[NHIFBandOut])
def list_bands(db: Session = Depends(get_db)):
    return db.query(NHIFBand).order_by(NHIFBand.start_date.desc()).all()

@router.post("/", response_model=NHIFBandOut)
def create_band(band: NHIFBandCreate, db: Session = Depends(get_db)):
    obj = NHIFBand(**band.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/{band_id}", response_model=NHIFBandOut)
def update_band(band_id: int, band: NHIFBandUpdate, db: Session = Depends(get_db)):
    obj = db.query(NHIFBand).filter(NHIFBand.id == band_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Band not found")
    for key, value in band.dict().items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/{band_id}")
def delete_band(band_id: int, db: Session = Depends(get_db)):
    obj = db.query(NHIFBand).filter(NHIFBand.id == band_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Band not found")
    db.delete(obj)
    db.commit()
    return {"message": "Deleted"}