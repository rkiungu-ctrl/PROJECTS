from pydantic import BaseModel
from typing import Optional


class PurchaseInvoiceLineBase(BaseModel):
    type: str
    product_id: Optional[int] = None
    item: Optional[str] = None
    description: Optional[str] = None
    quantity: float = 1
    unit_price: float = 0
    amount: float = 0
    vat: float = 0
    excise: float = 0
    account_code: Optional[str] = None
    vat_code: Optional[str] = None
    excise_code: Optional[str] = None

class PurchaseInvoiceLineCreate(PurchaseInvoiceLineBase):
    pass

class PurchaseInvoiceLineUpdate(PurchaseInvoiceLineBase):
    pass

class PurchaseInvoiceLineResponse(PurchaseInvoiceLineBase):
    id: int
    class Config:
        from_attributes = True
