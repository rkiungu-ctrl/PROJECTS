from pydantic import BaseModel
from datetime import date
from typing import Optional


class CreatePayroll(BaseModel):
    staff_no: str  # ✅ Used for user input instead of employee_id
    period: date

    basic_salary: float
    house_allowance: float
    transport_allowance: float
    other_allowances: float
    commission: float
    bonus: float

    loan: float
    advance: float


class PayrollOut(BaseModel):  # ✅ Renamed to avoid clash with SQLAlchemy model
    id: int
    employee_id: int
    period: date

    basic_salary: float
    house_allowance: float
    transport_allowance: float
    other_allowances: float
    commission: float
    bonus: float

    gross_pay: float
    taxable_pay: float
    shif: float
    nssf: float
    paye: float
    ahl: float
    loan: float
    advance: float
    net_pay: float

    class Config:
        orm_mode = True


class PayrollSummary(BaseModel):
    period: date
    total_gross: float
    total_net: float
    total_paye: float
    total_nssf: float
    total_shif: float
    total_ahl: float
    total_nssf_employer: float
    total_ahl_employer: float
    total_nita_employer: float
    employee_count: int

    class Config:
        orm_mode = True


class PayrollDetailSchema(BaseModel):
    id: int
    payslip_number: Optional[str] = None  # <-- Add this
    staff_no: str
    name: str
    basic_salary: float
    house_allowance: float
    transport_allowance: float
    other_allowances: float
    commission: float
    bonus: float
    gross_pay: float
    nssf: float
    shif: float
    ahl: float
    paye: float
    loan: float
    advance: float
    net_pay: float
    ahl_employer: Optional[float] = 0.0
    nssf_employer: Optional[float] = 0.0
    nita_employer: Optional[float] = 0.0

    # Add these fields to match your employee model and API response:
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    branch_name: Optional[str] = None
    branch_code: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None
    kra_pin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    id_number: Optional[str] = None

    class Config:
        orm_mode = True


class PayrollDetail(BaseModel):
    id: int
    staff_no: str
    name: str
    gross_pay: float
    paye: float
    nssf: float
    shif: float
    ahl: float
    nssf_employer: float
    ahl_employer: float
    nita_employer: float
    net_pay: float
    # Add other fields as needed

    class Config:
        orm_mode = True
