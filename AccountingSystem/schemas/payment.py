# schemas/payment.py
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import date

# ---------- Create payloads ----------
class SupplierPaymentLineCreate(BaseModel):
    purchase_id: Optional[int] = Field(
        None, description="Optional: link this portion of the payment to a specific purchase"
    )
    amount_applied: float = Field(..., gt=0, description="Amount allocated to this purchase (or ad-hoc)")
    account_id: Optional[int] = None  # For bank charges

class SupplierPaymentCreate(BaseModel):
    date: date
    payee_type: str = "Supplier"
    supplier_id: Optional[int] = None
    customer_id: Optional[int] = None
    other_payee: Optional[str] = None
    staff_id: Optional[int] = None
    bank_account_id: int
    reference: Optional[str] = None
    narration: Optional[str] = None
    mode: str = "Bank"
    wht_amount: float = 0.0
    lines: List[SupplierPaymentLineCreate]

    @validator("lines")
    def at_least_one_line(cls, v):
        if not v:
            raise ValueError("At least one payment line is required")
        return v

    @validator("wht_amount")
    def non_negative_wht(cls, v):
        if v < 0:
            raise ValueError("WHT amount cannot be negative")
        return v

# ---------- Response models ----------
class SupplierPaymentLineResponse(BaseModel):
    id: int
    purchase_id: Optional[int]
    amount_applied: float

    class Config:
        from_attributes = True  # pydantic v2: model_config = ConfigDict(from_attributes=True)

class SupplierPaymentResponse(BaseModel):
    id: int
    date: date
    payee_type: str
    supplier_id: Optional[int]
    customer_id: Optional[int]
    other_payee: Optional[str]
    staff_id: Optional[int]
    bank_account_id: int
    reference: Optional[str]
    narration: Optional[str]
    mode: str
    wht_amount: float
    gross_amount: float
    cash_paid: float
    status: str
    lines: List[SupplierPaymentLineCreate]
    supplier_name: Optional[str] = None
    customer_name: Optional[str] = None
    staff_name: Optional[str] = None

    class Config:
        from_attributes = True

class PaymentListOut(BaseModel):
    id: int
    date: str
    amount: float
    payee_type: str
    supplier_id: Optional[int]
    customer_id: Optional[int]
    other_payee: Optional[str]
    staff_id: Optional[int]
    bank_account_id: Optional[int]
    reference: Optional[str]
    narration: Optional[str]
    mode: Optional[str]
    status: Optional[str]
    supplier_name: Optional[str]
    customer_name: Optional[str]
    staff_name: Optional[str]
    source: str

