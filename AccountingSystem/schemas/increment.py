import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from datetime import date

class IncrementBase(BaseModel):
    start_date: date
    gross_pay: float

class IncrementCreate(IncrementBase):
    end_date: date | None = None

class IncrementSchema(IncrementBase):
    id: int
    end_date: date | None = None
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True