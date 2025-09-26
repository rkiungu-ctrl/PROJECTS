# models/loan.py
from sqlalchemy import Column, Integer, String, Float, Date, Numeric, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base

class EmployeeLoan(Base):
    __tablename__ = "employee_loans"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    principal = Column(Numeric(12,2), nullable=False)
    balance   = Column(Numeric(12,2), nullable=False)
    interest_rate = Column(Float, default=0.0)            # per month, if any
    start_date = Column(Date, nullable=False)
    installment_amount = Column(Numeric(12,2), nullable=False)
    active = Column(Boolean, default=True)
    note = Column(String(255))

class EmployeeAdvance(Base):
    __tablename__ = "employee_advances"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    amount   = Column(Numeric(12,2), nullable=False)
    balance  = Column(Numeric(12,2), nullable=False)
    issue_date = Column(Date, nullable=False)
    recover_months = Column(Integer, default=1)  # 1 = recover next payroll
    note = Column(String(255))

class LoanAdvance(Base):
    __tablename__ = "loan_advances"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    loan_type = Column(String, nullable=False)  # e.g., Salary Advance, Staff Loan
    reference_no = Column(String, unique=True, nullable=False)
    principal_amount = Column(Numeric(12,2), nullable=False)
    date_issued = Column(Date, nullable=False)
    interest_rate = Column(Float, default=0.0)
    repayment_period = Column(Integer, nullable=False)  # months/installments
    installment_amount = Column(Numeric(12,2), nullable=False)
    deduction_method = Column(String, nullable=False)  # fixed/%/lump sum
    balance_outstanding = Column(Numeric(12,2), nullable=False)
    amount_repaid = Column(Numeric(12,2), default=0.0)
    status = Column(String, default="Active")  # Active, Cleared, Defaulted, Written-off
    last_deduction_date = Column(Date)
    next_due_date = Column(Date)
    payslip_number = Column(String)  # For payroll linkage
    debit_account_id = Column(Integer)  # COA FK
    credit_account_id = Column(Integer)  # COA FK
    journal_entry_id = Column(Integer)  # Journal FK
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    created_by = Column(String)
    approved_by = Column(String)
    guarantor_id = Column(Integer, nullable=True)
    remarks = Column(String)
    penalty_rate = Column(Float, default=0.0)
    attachment = Column(String)  # file path or URL
