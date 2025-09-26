# models/company.py
from sqlalchemy import Column, Integer, String, Text
from database import Base

class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    id = Column(Integer, primary_key=True, index=True)

    # Company info
    company_name   = Column(String(255), default="")
    legal_name     = Column(String(255), default="")
    phone          = Column(String(100), default="")
    email          = Column(String(255), default="")
    kra_pin        = Column(String(100), default="")
    address        = Column(Text, default="")
    website        = Column(String(255), default="")
    currency       = Column(String(16), default="KES")
    invoice_prefix = Column(String(32), default="INV")

    # Media paths (saved on disk; we return URLs in responses)
    logo_path  = Column(String(512), nullable=True)
    stamp_path = Column(String(512), nullable=True)

    # Theme
    theme_primary      = Column(String(16), default="#0ea5e9")  # sky-500
    theme_accent       = Column(String(16), default="#22c55e")  # green-500
    theme_sidebar_bg   = Column(String(16), default="#111827")  # gray-900
    theme_sidebar_text = Column(String(16), default="#d1d5db")  # gray-300
