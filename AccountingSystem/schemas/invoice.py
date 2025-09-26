from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import date

class InvoiceLineCreate(BaseModel):
    type: Literal["Product", "Service"]
    product_id: Optional[int] = None
    item: Optional[str] = None
    description: Optional[str] = None  # ✅ now included
    quantity: Optional[float] = None
    amount: float

class InvoiceLineResponse(InvoiceLineCreate):
    id: int

    class Config:
        orm_mode = True

class InvoiceCreate(BaseModel):
    invoice_number: str
    invoice_date: date
    customer_name: str
    description: Optional[str] = None
    amount: float
    vat: float = 0
    excise: float = 0
    lines: List[InvoiceLineCreate]

class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    invoice_date: date
    customer_name: str
    description: Optional[str]
    amount: float
    vat: float
    excise: float
    lines: List[InvoiceLineResponse]

    class Config:
        orm_mode = True
