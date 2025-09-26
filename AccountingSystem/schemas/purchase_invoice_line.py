from pydantic import BaseModel
from typing import Optional

class PurchaseInvoiceLineCreate(BaseModel):
    product_id: int
    description: str
    quantity: float
    unit_price: float

class PurchaseInvoiceLineOut(BaseModel):
    product_id: int
    description: str
    quantity: float
    unit_price: float
    is_service: Optional[bool] = None  # Optional display field for output

    class Config:
        orm_mode = True
