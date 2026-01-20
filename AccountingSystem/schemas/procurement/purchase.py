
from pydantic import BaseModel, computed_field
from typing import Optional, List
from datetime import date
from .purchase_line import PurchaseInvoiceLineCreate, PurchaseInvoiceLineResponse

class PurchaseCreate(BaseModel):
    purchase_number: str
    purchase_date: date
    supplier_id: int | None = None
    supplier_name: str | None = None
    description: Optional[str] = None
    cu_inv_number: Optional[str] = None
    lines: List[PurchaseInvoiceLineCreate]

class PurchaseResponse(BaseModel):
    purchase_number: str
    purchase_date: date
    purchase_date_formatted: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    description: Optional[str] = None
    amount: float
    vat: float
    excise: float
    cu_inv_number: Optional[str] = None
    status: str
    balance_due: Optional[float] = 0
    lines: List[PurchaseInvoiceLineResponse]
    grand_total: float

    class Config:
        from_attributes = True

class PurchaseListResponse(BaseModel):
    items: List[PurchaseResponse]
    total: int
    page: int
    limit: int
    pages: int
