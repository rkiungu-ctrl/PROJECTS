# schemas/company.py
from typing import Optional
from pydantic import BaseModel

class ThemeSettings(BaseModel):
    primary: Optional[str] = None
    accent: Optional[str] = None
    sidebarBg: Optional[str] = None
    sidebarText: Optional[str] = None

class CompanyProfileBase(BaseModel):
    company_name: Optional[str] = ""
    legal_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    kra_pin: Optional[str] = ""
    address: Optional[str] = ""
    website: Optional[str] = ""
    currency: Optional[str] = "KES"
    invoice_prefix: Optional[str] = "INV"
    theme: Optional[ThemeSettings] = None

class CompanyProfileResponse(CompanyProfileBase):
    id: int
    logo_url: Optional[str] = None
    stamp_url: Optional[str] = None

    class Config:
        from_attributes = True  # Pydantic v2 (a.k.a. from_orm)
