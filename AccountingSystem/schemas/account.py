import pydantic as _pyd
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import date
# --- Account Schemas ---

class AccountBase(BaseModel):
    account_code: str
    name: str
    type: str
    description: Optional[str] = None
    is_active: Optional[bool] = True
    is_control_account: Optional[bool] = False
    is_physical: Optional[bool] = False
    parent_account_code: Optional[str] = None
    parent_account_id: Optional[int] = None

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_control_account: Optional[bool] = None
    is_physical: Optional[bool] = None
    parent_account_code: Optional[str] = None
    parent_account_id: Optional[int] = None

class AccountOut(BaseModel):
    id: int
    account_code: str
    name: str
    type: str
    description: Optional[str]
    is_active: bool
    is_control_account: bool
    is_physical: bool
    parent_account_code: Optional[str] = None  # <-- needed
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True

# --- Journal Schemas ---

class JournalLineCreate(BaseModel):
    account_code: str
    debit: float
    credit: float
    description: str

class JournalEntry(BaseModel):
    date: date
    reference: str
    description: str
    lines: List[JournalLineCreate]
