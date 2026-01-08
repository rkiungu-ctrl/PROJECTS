from sqlalchemy import Column, Integer, Float, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
import datetime

class PaymentReceipt(Base):
    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    date = Column(Date, nullable=True, default=datetime.date.today)
    amount = Column(Float, nullable=False)
    bank_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    reference = Column(String, nullable=True)
    narration = Column(String, nullable=True)

    invoice = relationship("Invoice", back_populates="receipts")
    bank_account = relationship("Account", back_populates="receipts")
