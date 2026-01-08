from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from .invoice_line import InvoiceLine  # <-- Make sure this import exists

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, nullable=False)
    invoice_date = Column(Date, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    description = Column(String, nullable=True)
    amount = Column(Float, default=0)
    vat = Column(Float, default=0)
    excise = Column(Float, default=0)
    status = Column(String, default="Draft")  # Draft, Issued, Paid
    journal_ref = Column(String, nullable=True)
    source = Column(String, default="manual")  # Tracks where the invoice came from
    cu_inv_number = Column(String, nullable=True)  # <-- Add this line

    customer = relationship("Customer", back_populates="invoices")
    receipts = relationship("PaymentReceipt", back_populates="invoice")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")  # ✅ this was missing

    # optional: link to a customer table later
