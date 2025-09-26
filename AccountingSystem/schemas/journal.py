from pydantic import BaseModel, validator
from typing import List, Optional
from datetime import date


class JournalLineBase(BaseModel):
    account_code: str
    narration: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0

    @validator('debit', 'credit')
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("Debit and credit amounts must be non-negative")
        return v


class JournalLineCreate(JournalLineBase):
    pass


class JournalLineOut(JournalLineBase):
    class Config:
        orm_mode = True


class CreateJournalEntry(BaseModel):
    date: date
    reference: Optional[str] = None
    narration: Optional[str] = None
    lines: List[JournalLineCreate]


class JournalEntryOut(BaseModel):
    id: int
    date: date
    reference: Optional[str]
    narration: Optional[str]
    lines: List[JournalLineOut]

    class Config:
        orm_mode = True
