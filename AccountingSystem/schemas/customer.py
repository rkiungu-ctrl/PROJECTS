from pydantic import BaseModel

class CustomerCreate(BaseModel):
    client_number: int
    name: str
    phone: str | None = None
    email: str | None = None
    kra_pin: str | None = None
    address: str | None = None

class CustomerOut(CustomerCreate):
    id: int

    class Config:
        orm_mode = True
