from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.orm import relationship
from database import Base

class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    item = Column(String, nullable=True)
    description = Column(String)
    quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    amount = Column(Float, nullable=False) 
    vat = Column(Float, default=0)         # ✅ NEW
    excise = Column(Float, default=0)      # ✅ NEW
    type = Column(String, nullable=False)
    
    invoice = relationship("Invoice", back_populates="lines")
    product = relationship("Product")
