# routes/company.py
import os
import shutil
import time
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.company import CompanyProfile
from schemas.company import CompanyProfileBase, CompanyProfileResponse, ThemeSettings

router = APIRouter(prefix="/company", tags=["Company"])

def _ensure_media_dir(subfolder: str) -> str:
    base_dir = os.path.join(os.getcwd(), "static", subfolder)
    os.makedirs(base_dir, exist_ok=True)
    return base_dir

def _to_response(model: CompanyProfile) -> CompanyProfileResponse:
    theme = ThemeSettings(
        primary=model.theme_primary,
        accent=model.theme_accent,
        sidebarBg=model.theme_sidebar_bg,
        sidebarText=model.theme_sidebar_text,
    )
    logo_url = (
        f"/static/company_logo/{os.path.basename(model.logo_path)}"
        if model.logo_path else None
    )
    stamp_url = (
        f"/static/company_stamp/{os.path.basename(model.stamp_path)}"
        if model.stamp_path else None
    )
    return CompanyProfileResponse(
        id=model.id,
        company_name=model.company_name,
        legal_name=model.legal_name,
        phone=model.phone,
        email=model.email,
        kra_pin=model.kra_pin,
        address=model.address,
        website=model.website,
        currency=model.currency,
        invoice_prefix=model.invoice_prefix,
        theme=theme,
        logo_url=logo_url,
        stamp_url=stamp_url,
    )

@router.get("/profile", response_model=CompanyProfileResponse)
def get_profile(db: Session = Depends(get_db)):
    profile = db.query(CompanyProfile).first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return _to_response(profile)

@router.post("/profile", response_model=CompanyProfileResponse)
def save_profile(data: CompanyProfileBase, db: Session = Depends(get_db)):
    profile = db.query(CompanyProfile).first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)

    profile.company_name   = data.company_name or ""
    profile.legal_name     = data.legal_name or ""
    profile.phone          = data.phone or ""
    profile.email          = data.email or ""
    profile.kra_pin        = data.kra_pin or ""
    profile.address        = data.address or ""
    profile.website        = data.website or ""
    profile.currency       = data.currency or "KES"
    profile.invoice_prefix = data.invoice_prefix or "INV"

    if data.theme:
        profile.theme_primary      = data.theme.primary      or profile.theme_primary
        profile.theme_accent       = data.theme.accent       or profile.theme_accent
        profile.theme_sidebar_bg   = data.theme.sidebarBg    or profile.theme_sidebar_bg
        profile.theme_sidebar_text = data.theme.sidebarText  or profile.theme_sidebar_text

    db.commit()
    db.refresh(profile)
    return _to_response(profile)

def _save_image_to(subfolder: str, file: UploadFile) -> str:
    if not file.content_type or not file.content_type.startswith(("image/",)):
        raise HTTPException(status_code=400, detail="Invalid file type. Upload an image.")
    upload_dir = _ensure_media_dir(subfolder)
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        ext = ".png"
    filename = f"{subfolder.rstrip('/').split('_')[-1]}_{int(time.time())}{ext}"
    dest_path = os.path.join(upload_dir, filename)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return dest_path

@router.post("/logo")
def upload_logo(logo: UploadFile = File(...), db: Session = Depends(get_db)):
    dest_path = _save_image_to("company_logo", logo)
    profile = db.query(CompanyProfile).first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    profile.logo_path = dest_path
    db.commit()
    return {"logo_url": f"/static/company_logo/{os.path.basename(dest_path)}"}

@router.post("/stamp")
def upload_stamp(stamp: UploadFile = File(...), db: Session = Depends(get_db)):
    dest_path = _save_image_to("company_stamp", stamp)
    profile = db.query(CompanyProfile).first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    profile.stamp_path = dest_path
    db.commit()
    return {"stamp_url": f"/static/company_stamp/{os.path.basename(dest_path)}"}
