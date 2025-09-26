from pydantic import BaseModel
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

    class Config:
        orm_mode = True
