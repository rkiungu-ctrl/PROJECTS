from pydantic import BaseModel
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

    class Config:
        orm_mode = True