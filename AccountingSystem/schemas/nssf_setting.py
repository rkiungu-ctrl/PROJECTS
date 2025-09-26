# schemas/nssf_setting.py
from datetime import date
from pydantic import BaseModel, Field
from typing import Optional

class NSSFSettingBase(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    lel: float = Field(..., description="Lower Earnings Limit")
    uel: float = Field(..., description="Upper Earnings Limit")
    rate_employee: float = 0.06
    rate_employer: float = 0.06

    # Optional: allow posting caps explicitly; if omitted we compute them
    tier1_cap: Optional[float] = None
    tier2_cap: Optional[float] = None
    max_employee_total: Optional[float] = None

class NSSFSettingCreate(NSSFSettingBase):
    pass

class NSSFSettingUpdate(NSSFSettingBase):
    pass

class NSSFSettingOut(BaseModel):
    id: int
    start_date: date
    end_date: Optional[date]
    lel: float
    uel: float
    rate_employee: float
    rate_employer: float
    tier1_cap: Optional[float]
    tier2_cap: Optional[float]
    max_employee_total: Optional[float]

    class Config:
        orm_mode = True
