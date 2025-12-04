# schemas/employee.py
from typing import Optional, List, Any
from pydantic import BaseModel, validator
from datetime import date, datetime
import json

class EmployeeSchema(BaseModel):
    id: int
    staff_no: str
    name: str

    # Contact / IDs
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    official_email: Optional[str] = None
    kra_pin: Optional[str] = None
    id_number: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None

    # Address
    country: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    postal_code: Optional[str] = None
    office_phone: Optional[str] = None

    # Banking / salary
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    branch_name: Optional[str] = None
    branch_code: Optional[str] = None
    salary_processing_method: Optional[str] = None

    basic_salary: Optional[float] = None
    house_allowance: Optional[float] = None
    transport_allowance: Optional[float] = None
    other_allowances: Optional[float] = None
    commission: Optional[float] = None
    bonus: Optional[float] = None
    is_director: Optional[bool] = None
    employment_type: Optional[str] = None
    is_active: Optional[bool] = None

    # Personal / payroll extras
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
    # Photo helper fields (do NOT return raw bytes in API responses)
    passport_photo_url: Optional[str] = None
    has_passport_photo: Optional[bool] = None

    # HR
    job_title: Optional[str] = None
    department: Optional[str] = None
    reports_to: Optional[str] = None
    head_of: Optional[str] = None        # ✅ included
    region: Optional[str] = None
    date_of_employment: Optional[date] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    project: Optional[str] = None

    # Extras returned
    next_of_kin: Optional[List[Any]] = []  # will be list in responses
    loans: Optional[List[Any]] = []
    advances: Optional[List[Any]] = []

    # Pydantic v2: enable from_attributes for .from_orm-like behavior
    model_config = {
        "from_attributes": True
    }

    @validator("date_of_birth", pre=True)
    def _date_to_str(cls, v):
        if isinstance(v, (date, datetime)):
            return v.isoformat()
        return v

    @validator("next_of_kin", pre=True, always=True)
    def _parse_nok(cls, v):
        # If already a list, keep it. If it's a JSON string, parse it. If None, return [].
        if v is None:
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v


# keep CreateEmployee/UpdateEmployee as-is (or add head_of there later if you send JSON)
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
    salary_processing_method: Optional[str] = None
    house_allowance: float
    transport_allowance: float
    other_allowances: float
    commission: float
    bonus: float
    is_director: bool
    employment_type: str


class UpdateEmployee(BaseModel):
    name: Optional[str] = None
    # ... your existing optional fields ...
    pass
