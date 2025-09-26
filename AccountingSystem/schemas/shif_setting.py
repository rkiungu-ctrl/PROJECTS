from pydantic import BaseModel
from datetime import date

class SHIFSettingBase(BaseModel):
    rate: float
    cap: float
    start_date: date
    end_date: date | None = None

class SHIFSettingCreate(SHIFSettingBase):
    pass

class SHIFSettingOut(SHIFSettingBase):
    id: int
    class Config:
        orm_mode = True