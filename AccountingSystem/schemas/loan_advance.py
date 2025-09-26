from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class EmployeeLoanSchema(BaseModel):
    id: int
    employee_id: int
    loan_type: str
    reference_no: str
    principal_amount: float
    date_issued: date
    interest_rate: float
    repayment_period: int
    installment_amount: float
    deduction_method: str
    balance_outstanding: float
    amount_repaid: float
    status: str
    last_deduction_date: Optional[date]
    next_due_date: Optional[date]
    payslip_number: Optional[str]
    debit_account_id: Optional[int]
    credit_account_id: Optional[int]
    journal_entry_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[str]
    approved_by: Optional[str]
    guarantor_id: Optional[int]
    remarks: Optional[str]
    penalty_rate: Optional[float]
    attachment: Optional[str]

    class Config:
        orm_mode = True

class EmployeeAdvanceSchema(BaseModel):
    id: int
    employee_id: int
    amount: float
    balance: float
    issue_date: date
    recover_months: int
    note: Optional[str]

    class Config:
        orm_mode = True