from sqlalchemy import Column, Integer, Float, Date, ForeignKey, String, Boolean, DateTime, func
from database import Base

class EmployeeNonCashBenefit(Base):
    __tablename__ = "employee_non_cash_benefits"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    staff_no = Column(String, nullable=True)
    period = Column(Date, nullable=False)
    amount = Column(Float, default=0)
    note = Column(String, nullable=True)
    date_created = Column(DateTime, server_default=func.now())
    is_applied = Column(Boolean, default=False)
