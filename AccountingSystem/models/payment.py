# models/payment.py
from sqlalchemy import Column, Integer, Float, ForeignKey, Date, String
from database import Base

class SupplierPayment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    other_payee = Column(String, nullable=True)
    payee_type = Column(String, nullable=False, default="Supplier")
    staff_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    amount = Column(Float, nullable=False)
    payment_date = Column(Date, nullable=False)
    bank_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    reference = Column(String, nullable=True)
    narration = Column(String, nullable=True)
    mode = Column(String, nullable=True)
    wht_amount = Column(Float, default=0.0)
    status = Column(String, default="Posted")
    cash_paid = Column(Float, default=0.0)
    gross_amount = Column(Float, default=0.0)
    # Add relationship for lines if needed
