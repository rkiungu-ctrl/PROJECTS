from pydantic import BaseModel
from typing import Optional

class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    unit_price: Optional[float] = None
    unit_of_measure: Optional[str] = None
    opening_stock: Optional[float] = None
    is_service: Optional[bool] = None

class ProductOut(BaseModel):
    id: int
    name: str
    sku: str
    unit_price: Optional[float]
    unit_of_measure: Optional[str]
    opening_stock: Optional[float]
    is_service: Optional[bool]
    current_stock: Optional[float]
    average_cost: Optional[float]
    total_cost: Optional[float]

    class Config:
        orm_mode = True
