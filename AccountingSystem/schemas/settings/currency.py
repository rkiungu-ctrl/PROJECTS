from pydantic import BaseModel, ConfigDict, conint, condecimal
from typing import Optional

class CurrencyBase(BaseModel):
    code: str
    name: str
    symbol: Optional[str] = None
    decimal_places: conint(ge=0, le=6) = 2
    rate_to_base: condecimal(max_digits=18, decimal_places=8) = 1
    active: bool = True

class CurrencyCreate(CurrencyBase):
    is_base: bool = False

class CurrencyUpdate(BaseModel):
    # allow editing code so we can repair the blank row
    code: Optional[str] = None
    name: Optional[str] = None
    symbol: Optional[str] = None
    decimal_places: Optional[int] = None
    rate_to_base: Optional[condecimal(max_digits=18, decimal_places=8)] = None
    active: Optional[bool] = None

class CurrencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    symbol: Optional[str] = None
    decimal_places: int
    rate_to_base: float
    is_base: bool
    active: bool
