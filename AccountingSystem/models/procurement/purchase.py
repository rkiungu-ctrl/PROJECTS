from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from .purchase_line import PurchaseInvoiceLine

class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, nullable=False)
    invoice_date = Column(Date, nullable=False)
    partner_id = Column(Integer, ForeignKey("partners.id"))
    description = Column(String, nullable=True)
    amount = Column(Float, default=0)
    vat = Column(Float, default=0)
    excise = Column(Float, default=0)
    status = Column(String, default="Draft")
    journal_ref = Column(String, nullable=True)
    source = Column(String, default="manual")
    cu_inv_number = Column(String, nullable=True)

    partner = relationship("Partner", back_populates="invoices")
    lines = relationship("PurchaseInvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
