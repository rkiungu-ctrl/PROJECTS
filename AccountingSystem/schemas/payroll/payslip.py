import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional

class Payslip(BaseModel):
    staff_no: str
    name: str
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

    # ✅ Employer contributions
    employer_nssf: Optional[float] = 0
    employer_ahl: Optional[float] = 0
    employer_nita: Optional[float] = 0
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True
