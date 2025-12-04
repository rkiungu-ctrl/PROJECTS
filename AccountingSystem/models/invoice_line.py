from sqlalchemy import Column, Integer, Float, String, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base

class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    item = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    quantity = Column(Float, default=1)
    unit_price = Column(Float, default=0)
    amount = Column(Float, default=0)
    vat = Column(Float, default=0)
    excise = Column(Float, default=0)
    type = Column(String(20), default="Service")
    # NEW:
    vat_code = Column(String(32), nullable=True)
    excise_code = Column(String(32), nullable=True)
    # optional existing:
    # service_item = Column(Text, nullable=True)

    invoice = relationship("Invoice", back_populates="lines")
    product = relationship("Product")
    
