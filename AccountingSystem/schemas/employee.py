from typing import List, Optional
from pydantic import BaseModel, validator
from datetime import date, datetime
from schemas.loan_advance import EmployeeLoanSchema, EmployeeAdvanceSchema

class EmployeeSchema(BaseModel):
    id: int
    staff_no: str
    name: str
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    kra_pin: Optional[str] = None
    id_number: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    branch_name: Optional[str] = None
    branch_code: Optional[str] = None
    basic_salary: Optional[float] = None
    house_allowance: Optional[float] = None
    transport_allowance: Optional[float] = None
    other_allowances: Optional[float] = None
    commission: Optional[float] = None
    bonus: Optional[float] = None
    is_director: Optional[bool] = None
    employment_type: Optional[str] = None
    is_active: Optional[bool] = None

    # ADD THESE FIELDS:
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    marital_status: Optional[str] = None
    dependants: Optional[int] = None
    passport_photo: Optional[bytes] = None
    payment_currency: Optional[str] = None
    work_shift: Optional[str] = None
    off_days: Optional[str] = None
    daily_hours: Optional[int] = None
    hourly_rate: Optional[float] = None
    daily_rate: Optional[float] = None
    income_tax: Optional[str] = None
    deduct_shif: Optional[bool] = None
    deduct_nssf: Optional[bool] = None
    deduct_housing_levy: Optional[bool] = None
    disability_exemption_amount: Optional[float] = None
    exemption_certificate_no: Optional[str] = None
    mobile_money: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    reports_to: Optional[str] = None
    region: Optional[str] = None
    date_of_employment: Optional[date] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    project: Optional[str] = None

    # New fields
    official_email: Optional[str] = None
    personal_email: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    office_phone: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    postal_code: Optional[str] = None

    loans: Optional[List[EmployeeLoanSchema]] = []
    advances: Optional[List[EmployeeAdvanceSchema]] = []

    class Config:
        orm_mode = True

    @validator("date_of_birth", pre=True)
    def date_to_str(cls, v):
        if isinstance(v, (date, datetime)):
            return v.isoformat()
        return v

class CreateEmployee(BaseModel):
    staff_no: str
    name: str
    phone: str
    personal_email: str
    kra_pin: str
    id_number: str
    nssf_number: str
    nhif_number: str
    bank_name: str
    bank_account: str
    branch_name: str
    branch_code: str
    basic_salary: float
    house_allowance: float
    transport_allowance: float
    other_allowances: float
    commission: float
    bonus: float
    is_director: bool
    employment_type: str

class UpdateEmployee(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    marital_status: Optional[str] = None
    dependants: Optional[int] = None
    id_number: Optional[str] = None
    kra_pin: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None
    passport_photo: Optional[bytes] = None
    employment_type: Optional[str] = None
    payment_currency: Optional[str] = None
    work_shift: Optional[str] = None
    off_days: Optional[str] = None
    daily_hours: Optional[int] = None
    hourly_rate: Optional[float] = None
    daily_rate: Optional[float] = None
    income_tax: Optional[str] = None
    deduct_shif: Optional[bool] = None
    deduct_nssf: Optional[bool] = None
    deduct_housing_levy: Optional[bool] = None
    disability_exemption_amount: Optional[float] = None
    exemption_certificate_no: Optional[str] = None
    mobile_money: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    branch_name: Optional[str] = None
    branch_code: Optional[str] = None
    official_email: Optional[str] = None
    personal_email: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    office_phone: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    postal_code: Optional[str] = None
    # ...add any other fields you need...
