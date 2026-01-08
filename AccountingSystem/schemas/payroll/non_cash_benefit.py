import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional

class EmployeeNonCashBenefitCreate(BaseModel):
    staff_no: Optional[str]
    employee_id: Optional[int]
    period: date
    amount: float
    note: Optional[str] = None

class EmployeeNonCashBenefitOut(EmployeeNonCashBenefitCreate):
    id: int
    is_applied: bool
    date_created: Optional[str]
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True
