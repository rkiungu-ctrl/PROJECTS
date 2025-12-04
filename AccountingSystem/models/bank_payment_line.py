from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class BankPaymentLine(Base):
    __tablename__ = "bank_payment_lines"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("bank_transactions.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    account_code = Column(String, nullable=False)
    amount = Column(Float, nullable=False)

    # Relationships
    payment = relationship("BankTransactionV2", back_populates="lines")
    account = relationship("Account")
