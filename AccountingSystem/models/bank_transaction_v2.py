# models/bank_transaction_v2.py

from datetime import datetime, date
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    Boolean,
    ForeignKey,
    DateTime,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base



class BankTransactionV2(Base):

    """
    Clean v2 Bank Transaction model.

    - One record per receipt/payment
    - amount is always positive
    - transaction_type = "receipt" or "payment"
    - linked to a bank/cash account via bank_account_id
    """

    __tablename__ = "bank_transactions"


    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("bank_accounts_v2.id"), nullable=False)
    date = Column(Date, nullable=False)
    transaction_type = Column(String, nullable=False)  # 'receipt' or 'payment' (also supports 'deposit'/'withdrawal')
    amount = Column(Float, nullable=False)
    reference = Column(String, nullable=True)
    narration = Column(String, nullable=True)
    is_reconciled = Column(Boolean, default=False)
    counter_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)  # WHAT: Chart of Accounts
    # Phase 2: categorisation + payee linkage
    is_categorized = Column(Boolean, default=False)
    payee_type = Column(String(50), nullable=True)  # 'customer' | 'supplier' | 'employee' | 'other'
    payee_id = Column(Integer, nullable=True)
    payee_name = Column(String(255), nullable=True)
    payee = Column(String(255), nullable=True)  # legacy/imported payee text

    # ETR/VAT fields
    payment_type = Column(String, default="normal")  # "normal", "etr_purchase", etc.
    etr_supplier_name = Column(String, nullable=True)
    etr_supplier_pin = Column(String, nullable=True)
    etr_number = Column(String, nullable=True)
    etr_date = Column(Date, nullable=True)
    etr_vat_code = Column(String, nullable=True)

    # Link to auto-created purchase invoice
    purchase_invoice_id = Column(Integer, ForeignKey("purchase_invoices.id"), nullable=True)

    # Relationships
    bank_account = relationship("BankAccountProfile", foreign_keys=[account_id])
    counter_account = relationship("Account")
    lines = relationship("BankPaymentLine", back_populates="payment", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<BankTransactionV2(id={self.id}, type={self.transaction_type}, amount={self.amount})>"


