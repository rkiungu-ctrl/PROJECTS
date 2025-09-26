from sqlalchemy import Column, Integer, Float, ForeignKey
from database import Base

class PaymentLine(Base):
    __tablename__ = "payment_lines"
    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"))
    purchase_id = Column(Integer, ForeignKey("purchase_invoices.id"), nullable=True)
    amount_applied = Column(Float, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)