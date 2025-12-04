import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Union
from datetime import date
from decimal import Decimal

# ---------- Line Schemas ----------
class PurchaseInvoiceLineBase(BaseModel):
    type: Optional[str] = None
    product_id: Optional[int] = None
    item: Optional[str] = None
    description: Optional[str] = None
    account_code: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    vat_code: Optional[str] = None
    excise_code: Optional[str] = None

class PurchaseInvoiceLineCreate(PurchaseInvoiceLineBase):
    pass

class PurchaseInvoiceLineUpdate(PurchaseInvoiceLineBase):
    id: Optional[int] = None

class PurchaseInvoiceLineOut(PurchaseInvoiceLineBase):
    id: int
    is_service: Optional[bool] = None
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True

class PurchaseInvoiceLineIn(BaseModel):
    type: Optional[str] = None
    product_id: Optional[int] = None
    item: Optional[str] = None
    account_code: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = 0
    unit_price: Optional[float] = 0
    vat_code: Optional[str] = None
    excise_code: Optional[str] = None

    class Config:
        extra = "ignore"

# ---------- Header Schemas ----------
class PurchaseInvoiceBase(BaseModel):
    supplier_id: int
    reference: Optional[str] = None
    invoice_date: date
    currency_code: Optional[str] = None
    cu_inv_number: Optional[str] = None
    is_recurring: Optional[bool] = False
    recurrence_interval: Optional[str] = None
    recurrence_end_date: Optional[date] = None

class PurchaseInvoiceCreate(PurchaseInvoiceBase):
    lines: List[PurchaseInvoiceLineCreate] = []
    currency_code: Optional[str] = "KES"
    exchange_rate: Optional[float] = 1.0

class PurchaseInvoiceUpdate(BaseModel):
    invoice_date: Optional[Union[date, str]] = None
    supplier_id: Optional[int] = None
    invoice_number: Optional[str] = None
    reference: Optional[str] = None
    narration: Optional[str] = None
    currency_code: Optional[str] = None
    exchange_rate: Optional[float] = None
    cu_inv_number: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_interval: Optional[str] = None
    recurrence_end_date: Optional[Union[date, str]] = None
    lines: Optional[List[PurchaseInvoiceLineIn]] = None
    next_issue_date: Optional[str] = None

    class Config:
        extra = "ignore"

class PurchaseInvoiceOut(PurchaseInvoiceBase):
    id: int
    status: Optional[str] = None
    total_amount: Optional[Decimal] = None
    lines: List[PurchaseInvoiceLineOut] = []
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True
