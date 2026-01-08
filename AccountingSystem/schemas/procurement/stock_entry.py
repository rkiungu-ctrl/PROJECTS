from pydantic import BaseModel
from datetime import date
from typing import Optional

class StockEntryCreate(BaseModel):
    product_id: int
    date: Optional[date] = None
    quantity: float
    type: str  # IN or OUT
    reference: Optional[str] = None
    remarks: Optional[str] = None
