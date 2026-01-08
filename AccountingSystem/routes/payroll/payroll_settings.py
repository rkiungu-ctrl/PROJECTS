# routes/payroll_settings.py
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from database import get_db
from typing import List
import pandas as pd
from io import BytesIO

from models.payroll_settings import PayrollSetting
from models.nssf_setting import NSSFSetting
from schemas.nssf_setting import NSSFSettingCreate, NSSFSettingUpdate, NSSFSettingOut
from models.nhif_band import NHIFBand
from schemas.nhif_band import NHIFBandCreate, NHIFBandUpdate, NHIFBandOut
from models.paye import PayeTable, PayeBand
from schemas.paye import PayeTableCreate, PayeTableOut
from models.ahl import AHLTable
from schemas.ahl import AHLTable as AHLTableSchema
from models.shif_setting import SHIFSetting
from schemas.shif_setting import SHIFSettingCreate, SHIFSettingOut

router = APIRouter(prefix="/payroll-settings", tags=["Payroll Settings"])

# -------------------------
# Payroll Settings (Generic)
# -------------------------
@router.get("/")
def list_settings(db: Session = Depends(get_db)):
    return db.query(PayrollSetting).all()

@router.post("/")
def create_setting(setting: dict, db: Session = Depends(get_db)):
    s = PayrollSetting(**setting)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.put("/{setting_id}")
def update_setting(setting_id: int, setting: dict, db: Session = Depends(get_db)):
    s = db.query(PayrollSetting).filter(PayrollSetting.id == setting_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Setting not found")
    for k, v in setting.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s

@router.delete("/{setting_id}")
def delete_setting(setting_id: int, db: Session = Depends(get_db)):
    s = db.query(PayrollSetting).filter(PayrollSetting.id == setting_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Setting not found")
    db.delete(s)
    db.commit()
    return {"message": "Deleted"}

# -------------------------
# NSSF period settings
# -------------------------
nssf = APIRouter(prefix="/nssf", tags=["Payroll Settings"])

def _compute_caps(payload: NSSFSettingCreate | NSSFSettingUpdate) -> dict:
    lel = float(payload.lel)
    uel = float(payload.uel)
    re  = float(payload.rate_employee or 0.06)

    tier1 = payload.tier1_cap if payload.tier1_cap is not None else round(lel * re, 2)
    tier2 = payload.tier2_cap if payload.tier2_cap is not None else round((uel - lel) * re, 2)
    total = payload.max_employee_total if payload.max_employee_total is not None else round(tier1 + tier2, 2)

    return {
        "tier1_cap": tier1,
        "tier2_cap": tier2,
        "max_employee_total": total,
    }

def _overlaps(db: Session, start: date, end: date | None, exclude_id: int | None = None) -> bool:
    q = db.query(NSSFSetting)
    if exclude_id:
        q = q.filter(NSSFSetting.id != exclude_id)

    if end is None:
        return db.query(NSSFSetting).filter(
            and_(NSSFSetting.end_date == None, NSSFSetting.start_date <= start)
        ).first() is not None or db.query(NSSFSetting).filter(
            and_(NSSFSetting.end_date != None, NSSFSetting.start_date <= (NSSFSetting.end_date), start <= (NSSFSetting.end_date))
        ).first() is not None

    exists = db.query(NSSFSetting).filter(
        and_(
            NSSFSetting.start_date <= end,
            ((NSSFSetting.end_date == None) | (NSSFSetting.end_date >= start))
        )
    )
    if exclude_id:
        exists = exists.filter(NSSFSetting.id != exclude_id)
    return exists.first() is not None

@nssf.get("/", response_model=list[NSSFSettingOut])
def list_nssf_periods(db: Session = Depends(get_db)):
    return db.query(NSSFSetting).order_by(NSSFSetting.start_date.desc()).all()

@nssf.post("/", response_model=NSSFSettingOut)
def create_nssf_setting(payload: NSSFSettingCreate, db: Session = Depends(get_db)):
    if _overlaps(db, payload.start_date, payload.end_date):
        raise HTTPException(400, "Overlapping period with existing NSSF settings.")
    caps = _compute_caps(payload)
    rec = NSSFSetting(
        start_date=payload.start_date,
        end_date=payload.end_date,
        lel=payload.lel,
        uel=payload.uel,
        rate_employee=payload.rate_employee,
        rate_employer=payload.rate_employer,
        **caps
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec

@nssf.put("/{id}", response_model=NSSFSettingOut)
def update_nssf_setting(id: int, payload: NSSFSettingUpdate, db: Session = Depends(get_db)):
    rec = db.query(NSSFSetting).filter(NSSFSetting.id == id).first()
    if not rec:
        raise HTTPException(404, "NSSF setting not found")

    if _overlaps(db, payload.start_date, payload.end_date, exclude_id=id):
        raise HTTPException(400, "Overlapping period with existing NSSF settings.")

    caps = _compute_caps(payload)
    for k, v in {
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "lel": payload.lel,
        "uel": payload.uel,
        "rate_employee": payload.rate_employee,
        "rate_employer": payload.rate_employer,
        **caps,
    }.items():
        setattr(rec, k, v)

    db.commit()
    db.refresh(rec)
    return rec

@nssf.delete("/{id}")
def delete_nssf_setting(id: int, db: Session = Depends(get_db)):
    rec = db.query(NSSFSetting).filter(NSSFSetting.id == id).first()
    if not rec:
        raise HTTPException(404, "NSSF setting not found")
    db.delete(rec)
    db.commit()
    return {"message": "Deleted"}

router.include_router(nssf)

# -------------------------
# PAYE settings
# -------------------------
from sqlalchemy.orm import joinedload

paye = APIRouter(prefix="/paye", tags=["Payroll Settings"])

@paye.get("/", response_model=list[PayeTableOut])
def list_paye(db: Session = Depends(get_db)):
    # Return ONLY PayeTable ORM rows, with nested bands eagerly loaded
    tables = (
        db.query(PayeTable)
        .options(joinedload(PayeTable.bands))
        .order_by(PayeTable.start_date.asc())
        .all()
    )
    return tables

@paye.get("/{id}", response_model=PayeTableOut)
def get_paye(id: int, db: Session = Depends(get_db)):
    table = (
        db.query(PayeTable)
        .options(joinedload(PayeTable.bands))
        .filter(PayeTable.id == id)
        .first()
    )
    if not table:
        raise HTTPException(404, "PAYE table not found")
    return table

@paye.post("/", response_model=PayeTableOut)
def create_paye(payload: PayeTableCreate, db: Session = Depends(get_db)):
    # overlap check
    overlap = (
        db.query(PayeTable)
        .filter(
            PayeTable.start_date <= (payload.end_date or payload.start_date),
            (PayeTable.end_date == None) | (PayeTable.end_date >= payload.start_date),
        )
        .first()
    )
    if overlap:
        raise HTTPException(400, "Overlapping PAYE period.")

    table = PayeTable(
        start_date=payload.start_date,
        end_date=payload.end_date,
        personal_relief=payload.personal_relief,
        insurance_relief_rate=payload.insurance_relief_rate,
        insurance_relief_cap=payload.insurance_relief_cap,
    )
    db.add(table)
    db.flush()  # get table.id before adding bands

    for b in payload.bands:
        db.add(
            PayeBand(
                table_id=table.id,
                lower=b.lower,
                upper=b.upper,
                rate=b.rate,  # store decimal, e.g. 0.10
            )
        )

    db.commit()
    # re-read with bands
    table = (
        db.query(PayeTable)
        .options(joinedload(PayeTable.bands))
        .filter(PayeTable.id == table.id)
        .first()
    )
    return table

@paye.put("/{id}", response_model=PayeTableOut)
def update_paye(id: int, payload: PayeTableCreate, db: Session = Depends(get_db)):
    table = db.query(PayeTable).filter(PayeTable.id == id).first()
    if not table:
        raise HTTPException(404, "PAYE table not found")

    # overlap check (exclude self)
    overlap = (
        db.query(PayeTable)
        .filter(
            PayeTable.id != id,
            PayeTable.start_date <= (payload.end_date or payload.start_date),
            (PayeTable.end_date == None) | (PayeTable.end_date >= payload.start_date),
        )
        .first()
    )
    if overlap:
        raise HTTPException(400, "Overlapping PAYE period.")

    table.start_date = payload.start_date
    table.end_date = payload.end_date
    table.personal_relief = payload.personal_relief
    table.insurance_relief_rate = payload.insurance_relief_rate
    table.insurance_relief_cap = payload.insurance_relief_cap

    # replace bands
    db.query(PayeBand).filter(PayeBand.table_id == id).delete()
    db.flush()
    for b in payload.bands:
        db.add(
            PayeBand(
                table_id=id,
                lower=b.lower,
                upper=b.upper,
                rate=b.rate,
            )
        )

    db.commit()
    table = (
        db.query(PayeTable)
        .options(joinedload(PayeTable.bands))
        .filter(PayeTable.id == id)
        .first()
    )
    return table

@paye.delete("/{id}")
def delete_paye(id: int, db: Session = Depends(get_db)):
    table = db.query(PayeTable).filter(PayeTable.id == id).first()
    if not table:
        raise HTTPException(404, "PAYE table not found")
    # bands have FK; if you didn't set cascade on relationship,
    # delete bands explicitly first:
    db.query(PayeBand).filter(PayeBand.table_id == id).delete()
    db.delete(table)
    db.commit()
    return {"message": "Deleted"}

# Register PAYE sub-router so endpoints are available under /payroll-settings/paye
router.include_router(paye)

# -------------------------
# NHIF Bands
# -------------------------
ahl = APIRouter(prefix="/ahl", tags=["Payroll Settings"])

@ahl.get("/", response_model=list[AHLTableSchema])
def list_ahl_tables(db: Session = Depends(get_db)):
    return db.query(AHLTable).order_by(AHLTable.start_date.desc()).all()


@ahl.post("/", response_model=AHLTableSchema)
def create_ahl_table(payload: AHLTableSchema, db: Session = Depends(get_db)):
    rec = AHLTable(
        start_date=payload.start_date,
        end_date=payload.end_date,
        employee_rate=payload.employee_rate,
        employer_rate=payload.employer_rate,
        relief_rate=payload.relief_rate,
        relief_cap_month=payload.relief_cap_month,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@ahl.put("/{id}", response_model=AHLTableSchema)
def update_ahl_table(id: int, payload: AHLTableSchema, db: Session = Depends(get_db)):
    rec = db.query(AHLTable).filter(AHLTable.id == id).first()
    if not rec:
        raise HTTPException(404, "AHL table not found")
    rec.start_date = payload.start_date
    rec.end_date = payload.end_date
    rec.employee_rate = payload.employee_rate
    rec.employer_rate = payload.employer_rate
    rec.relief_rate = payload.relief_rate
    rec.relief_cap_month = payload.relief_cap_month
    db.commit()
    db.refresh(rec)
    return rec


@ahl.delete("/{id}")
def delete_ahl_table(id: int, db: Session = Depends(get_db)):
    rec = db.query(AHLTable).filter(AHLTable.id == id).first()
    if not rec:
        raise HTTPException(404, "AHL table not found")
    db.delete(rec)
    db.commit()
    return {"message": "Deleted"}

router.include_router(ahl)

nhif = APIRouter(prefix="/nhif", tags=["Payroll Settings"])

@nhif.get("/", response_model=list[NHIFBandOut])
def list_nhif_bands(db: Session = Depends(get_db)):
    return db.query(NHIFBand).order_by(NHIFBand.start_date.desc()).all()

@nhif.post("/", response_model=NHIFBandOut)
def create_nhif_band(payload: NHIFBandCreate, db: Session = Depends(get_db)):
    band = NHIFBand(**payload.dict())
    db.add(band)
    db.commit()
    db.refresh(band)
    return band

@nhif.put("/{id}", response_model=NHIFBandOut)
def update_nhif_band(id: int, payload: NHIFBandUpdate, db: Session = Depends(get_db)):
    band = db.query(NHIFBand).filter(NHIFBand.id == id).first()
    if not band:
        raise HTTPException(404, "NHIF band not found")
    for k, v in payload.dict().items():
        setattr(band, k, v)
    db.commit()
    db.refresh(band)
    return band

@nhif.delete("/{id}")
def delete_nhif_band(id: int, db: Session = Depends(get_db)):
    band = db.query(NHIFBand).filter(NHIFBand.id == id).first()
    if not band:
        raise HTTPException(404, "NHIF band not found")
    db.delete(band)
    db.commit()
    return {"message": "Deleted"}

@nhif.put("/batch", response_model=List[NHIFBandOut])
def batch_update_nhif_bands(payload: List[NHIFBandUpdate], db: Session = Depends(get_db)):
    updated = []
    for band_data in payload:
        band = db.query(NHIFBand).filter(NHIFBand.id == band_data.id).first()
        if not band:
            continue  # or handle error
        for k, v in band_data.dict(exclude_unset=True).items():
            setattr(band, k, v)
        db.commit()
        db.refresh(band)
        updated.append(band)
    return updated

@nhif.post("/bulk", response_model=List[NHIFBandOut])
def bulk_create_nhif_bands(payload: List[NHIFBandCreate], db: Session = Depends(get_db)):
    bands = [NHIFBand(**band.dict()) for band in payload]
    db.add_all(bands)
    db.commit()
    for band in bands:
        db.refresh(band)
    return bands

@nhif.post("/import", response_model=List[NHIFBandOut])
async def import_nhif_bands(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content))
    except Exception:
        try:
            df = pd.read_csv(BytesIO(content), encoding="utf-8")
        except UnicodeDecodeError:
            df = pd.read_csv(BytesIO(content), encoding="latin1")
    df.columns = [c.strip() for c in df.columns]
    bands = []
    for _, row in df.iterrows():
        # Skip rows with missing required fields
        if pd.isnull(row['start_date']) or pd.isnull(row['end_date']) or pd.isnull(row['lower_limit']) or pd.isnull(row['upper_limit']) or pd.isnull(row['deduction']):
            continue
        band = NHIFBand(
            start_date=pd.to_datetime(row['start_date']).date(),
            end_date=pd.to_datetime(row['end_date']).date() if pd.notnull(row['end_date']) else None,
            lower_limit=float(str(row['lower_limit']).replace(",", "")),
            upper_limit=float(str(row['upper_limit']).replace(",", "")),
            deduction=float(str(row['deduction']).replace(",", ""))
        )
        db.add(band)
        bands.append(band)
    db.commit()
    for band in bands:
        db.refresh(band)
    return bands

router.include_router(nhif)

# -------------------------
# SHIF settings
# -------------------------
shif = APIRouter(prefix="/shif", tags=["Payroll Settings"])

@shif.get("/", response_model=list[SHIFSettingOut])
def list_shif_settings(db: Session = Depends(get_db)):
    return db.query(SHIFSetting).order_by(SHIFSetting.start_date.desc()).all()

@shif.post("/", response_model=SHIFSettingOut)
def create_shif_setting(payload: SHIFSettingCreate, db: Session = Depends(get_db)):
    shif_setting = SHIFSetting(**payload.dict())
    db.add(shif_setting)
    db.commit()
    db.refresh(shif_setting)
    return shif_setting

@shif.put("/{id}", response_model=SHIFSettingOut)
def update_shif_setting(id: int, payload: SHIFSettingCreate, db: Session = Depends(get_db)):
    shif_setting = db.query(SHIFSetting).filter(SHIFSetting.id == id).first()
    if not shif_setting:
        raise HTTPException(404, "SHIF setting not found")
    for k, v in payload.dict().items():
        setattr(shif_setting, k, v)
    db.commit()
    db.refresh(shif_setting)
    return shif_setting

@shif.delete("/{id}")
def delete_shif_setting(id: int, db: Session = Depends(get_db)):
    shif_setting = db.query(SHIFSetting).filter(SHIFSetting.id == id).first()
    if not shif_setting:
        raise HTTPException(404, "SHIF setting not found")
    db.delete(shif_setting)
    db.commit()
    return {"message": "Deleted"}

router.include_router(shif)
