from pydantic import BaseModel, validator
from datetime import date, datetime
from typing import Optional, Union

class PaymentReceiptInput(BaseModel):
    invoice_id: str
    amount: float
    date: date
    reference: Optional[str] = None
    narration: Optional[str] = None
    bank_account_id: int

    @validator("date", pre=True)
    def parse_date(cls, v):
        print("🛠️ Incoming value in validator:", repr(v))
        return datetime.strptime(v, "%Y-%m-%d").date()

