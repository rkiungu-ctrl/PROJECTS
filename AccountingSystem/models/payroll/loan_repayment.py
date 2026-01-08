from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, UniqueConstraint, Boolean, Date
from database import Base
import datetime


class LoanRepayment(Base):
    __tablename__ = "loan_repayments"
    id = Column(Integer, primary_key=True)
    loan_id = Column(Integer, ForeignKey("loan_advances.id"), nullable=False)
    reference_no = Column(String, nullable=False)
    period_ym = Column(String, nullable=False)  # YYYY-MM
    amount = Column(Float, nullable=False)
    # New audit fields
    paid = Column(Boolean, default=False)
    paid_on = Column(Date, nullable=True)
    payslip_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('loan_id', 'period_ym', name='uix_loan_period'),
    )
