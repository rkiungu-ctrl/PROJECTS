from pydantic import BaseModel
from typing import Optional, List
from datetime import date

class TransactionLine(BaseModel):
    account_id: int
    amount: float
    narration: Optional[str] = None

class BankTransactionCreate(BaseModel):
    date: date
    type: str
    amount: float
    reference: Optional[str] = None
    narration: Optional[str] = None
    cash_flow_type: Optional[str] = None
    counter_account_id: Optional[int] = None  # <-- For single-account transactions
    lines: Optional[List[TransactionLine]] = None  # <-- For split lines

class BankTransactionOut(BankTransactionCreate):
    id: int

    class Config:
        orm_mode = True

class BankTransactionCreateByCode(BaseModel):
    account_code: Optional[int] = None
    date: str
    type: str
    amount: float
    reference: Optional[str] = None
    narration: Optional[str] = None
    lines: Optional[List[TransactionLine]] = None