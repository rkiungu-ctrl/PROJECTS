from pydantic import BaseModel
from typing import Optional

class InvoiceLineBase(BaseModel):
    type: str
    product_id: Optional[int] = None
    item: Optional[str] = None
    description: Optional[str] = None
    quantity: float = 1
    unit_price: float = 0
    amount: float = 0
    vat: float = 0
    excise: float = 0
    vat_code: Optional[str] = None        # <-- add
    excise_code: Optional[str] = None     # <-- add

class InvoiceLineCreate(InvoiceLineBase):
    pass

class InvoiceLineResponse(InvoiceLineBase):
    id: int
    class Config:
        from_attributes = True
