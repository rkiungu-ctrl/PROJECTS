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

from pydantic import BaseModel, validator
from typing import Optional

class SupplierBase(BaseModel):
    pin: Optional[str] = None

    @validator("pin")
    def validate_pin(cls, v: Optional[str]) -> Optional[str]:
        """
        KRA PIN rules (simplified):
        - Optional field
        - If provided:
            - Trim spaces
            - Uppercase
            - Must be 11 characters (standard KRA PIN length)
            - Must start with 'A' (individual) or 'P' (company)
        """
        if v is None or v == "":
            return v
        v = v.strip().upper()
        if len(v) != 11:
            raise ValueError("KRA PIN must be 11 characters long")
        if v[0] not in ("A", "P"):
            raise ValueError("KRA PIN must start with 'A' (individual) or 'P' (company)")
        return v


class SupplierCreate(SupplierBase):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None


class SupplierUpdate(SupplierBase):
    name: Optional[str] = None
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
    pin: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None
