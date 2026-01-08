from pydantic import BaseModel, computed_field
from typing import Optional, List
from datetime import date
from .invoice_line import InvoiceLineCreate, InvoiceLineResponse

class InvoiceCreate(BaseModel):
    invoice_number: str
    invoice_date: date
    client_number: int                 # <-- require client_number
    description: Optional[str] = None
    cu_inv_number: Optional[str] = None
    lines: List[InvoiceLineCreate]

class InvoiceResponse(BaseModel):
    invoice_number: str
    invoice_date: date
    invoice_date_formatted: Optional[str] = None
    customer_name: Optional[str] = None
    description: Optional[str] = None
    amount: float
    vat: float
    excise: float
    cu_inv_number: Optional[str] = None
    status: str
    balance_due: Optional[float] = 0
    lines: List[InvoiceLineResponse]
    grand_total: float

    class Config:
        from_attributes = True

class InvoiceListResponse(BaseModel):
    items: List[InvoiceResponse]
    total: int
    page: int
    limit: int
    pages: int
