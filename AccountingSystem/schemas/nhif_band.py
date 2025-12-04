import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional

class NHIFBandBase(BaseModel):
    start_date: date
    end_date: Optional[date]
    lower_limit: float
    upper_limit: float
    deduction: float

class NHIFBandCreate(NHIFBandBase):
    pass

class NHIFBandUpdate(NHIFBandBase):
    pass

class NHIFBandOut(NHIFBandBase):
    id: int
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True