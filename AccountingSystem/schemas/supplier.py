from pydantic import BaseModel
from typing import Optional

class SupplierCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None
