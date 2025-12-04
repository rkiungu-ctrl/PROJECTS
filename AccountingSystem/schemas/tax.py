import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional

class TaxBase(BaseModel):
    name: str
    type: str     # e.g., "VAT", "Excise"
    rate: float
    start_date: date
    end_date: Optional[date] = None
    account_code: str

class TaxCreate(TaxBase):
    pass

class TaxOut(TaxBase):
    id: int
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True
