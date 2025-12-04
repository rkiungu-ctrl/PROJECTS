import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
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

class PayeBandOut(BaseModel):
    id: int
    lower: float
    upper: float | None = None
    rate: float
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True


class PayeTableOut(BaseModel):
    id: int
    start_date: date
    end_date: date | None = None
    personal_relief: float
    insurance_relief_rate: float | None = None
    insurance_relief_cap: float | None = None
    bands: list[PayeBandOut] = []
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True
