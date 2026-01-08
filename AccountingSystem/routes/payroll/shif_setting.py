from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.shif_setting import SHIFSetting
from schemas.shif_setting import SHIFSettingCreate, SHIFSettingOut

router = APIRouter(prefix="/payroll-settings/shif", tags=["Payroll Settings"])

@router.get("/", response_model=list[SHIFSettingOut])
def list_shif_settings(db: Session = Depends(get_db)):
    return db.query(SHIFSetting).order_by(SHIFSetting.start_date.desc()).all()

@router.post("/", response_model=SHIFSettingOut)
def create_shif_setting(payload: SHIFSettingCreate, db: Session = Depends(get_db)):
    shif = SHIFSetting(**payload.dict())
    db.add(shif)
    db.commit()
    db.refresh(shif)
    return shif

@router.delete("/{id}")
def delete_shif_setting(id: int, db: Session = Depends(get_db)):
    shif = db.query(SHIFSetting).filter(SHIFSetting.id == id).first()
    if not shif:
        raise HTTPException(404, "SHIF setting not found")
    db.delete(shif)
    db.commit()
    return {"message": "Deleted"}