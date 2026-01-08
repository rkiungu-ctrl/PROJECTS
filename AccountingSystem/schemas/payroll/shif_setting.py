import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
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
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True