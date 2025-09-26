from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from database import Base
from typing import Optional, Union
from datetime import date

class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoices"

    id = Column(Integer, primary_key=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    reference = Column(String(64), unique=True, index=True, nullable=False)
    invoice_date = Column(String, nullable=False)  # Use String or Date as per your DB
    currency_code = Column(String(8), nullable=True)
    cu_inv_number = Column(String(64), nullable=True)
    status = Column(String(32), default="Draft")
    total_amount = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)
    is_recurring = Column(Integer, default=0)
    recurrence_interval = Column(String(32), nullable=True)
    recurrence_end_date = Column(String, nullable=True)  # Use String or Date as per your DB
    exchange_rate = Column(Float, default=1.0)  # must exist on the model
    next_issue_date = Column(Date, nullable=True)

    lines = relationship(
        "PurchaseInvoiceLine",
        back_populates="invoice",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.invoice_date = kwargs.get('invoice_date', None)
        self.recurrence_end_date = kwargs.get('recurrence_end_date', None)

   


