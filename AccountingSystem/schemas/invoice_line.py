from pydantic import BaseModel
from typing import Optional, Literal

class InvoiceLineCreate(BaseModel):
    type: Literal["Product", "Service"]
    product_id: Optional[int] = None
    item: Optional[str] = None
    description: Optional[str] = None  # ✅ now included
    quantity: float
    unit_price: float
    amount: float
    vat: float 
    excise: float

class InvoiceLineResponse(InvoiceLineCreate):
    id: int

    class Config:
        orm_mode = True
