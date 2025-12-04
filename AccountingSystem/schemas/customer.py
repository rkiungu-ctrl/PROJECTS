import pydantic as _pyd
from pydantic import BaseModel, ConfigDict

class CustomerCreate(BaseModel):
    client_number: int
    name: str
    phone: str | None = None
    email: str | None = None
    kra_pin: str | None = None
    address: str | None = None

class CustomerOut(CustomerCreate):
    id: int
    model_config = ConfigDict(from_attributes=True, orm_mode=True)
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True
