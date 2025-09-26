from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class PurchaseInvoiceLine(Base):
    __tablename__ = "purchase_invoice_lines"

    id = Column(Integer, primary_key=True)
    purchase_invoice_id = Column(Integer, ForeignKey("purchase_invoices.id"), index=True, nullable=False)

    product_id   = Column(Integer, nullable=True)
    description  = Column(String)
    quantity     = Column(Float, default=0.0, nullable=False)
    unit_price   = Column(Float, default=0.0, nullable=False)
    type         = Column(String)
    vat_code     = Column(String)      # ✅ not vat_id
    excise_code  = Column(String)      # ✅ not excise_id
    item         = Column(String)
    account_code = Column(String)
    invoice_id   = Column(Integer, nullable=True)    # legacy column exists in DB
    line_type    = Column(String, nullable=True)     # legacy column exists in DB
    amount       = Column(Float, default=0.0)

    invoice = relationship("PurchaseInvoice", back_populates="lines")
