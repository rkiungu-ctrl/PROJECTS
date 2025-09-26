from pydantic import BaseModel
from typing import Optional, List
from datetime import date

class PayeBandIn(BaseModel):
    lower: float
    upper: Optional[float] = None
    rate: float

class PayeTableCreate(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    personal_relief: float = 0.0
    insurance_relief_rate: Optional[float] = None
    insurance_relief_cap: Optional[float] = None
    bands: List[PayeBandIn]

class PayeBandOut(PayeBandIn):
    id: int

class PayeTableOut(BaseModel):
    id: int
    start_date: date
    end_date: Optional[date]
    personal_relief: float
    insurance_relief_rate: Optional[float]
    insurance_relief_cap: Optional[float]
    bands: List[PayeBandOut]
    class Config: from_attributes = True
