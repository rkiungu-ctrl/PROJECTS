import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date

class AHLTable(BaseModel):
    id: int | None = None
    start_date: date
    end_date: date | None = None
    employee_rate: float
    employer_rate: float
    relief_rate: float | None = None
    relief_cap_month: int | None = None

    model_config = ConfigDict(from_attributes=True)
