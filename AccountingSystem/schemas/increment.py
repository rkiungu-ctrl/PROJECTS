from pydantic import BaseModel
from datetime import date

class IncrementBase(BaseModel):
    start_date: date
    gross_pay: float

class IncrementCreate(IncrementBase):
    pass

class IncrementSchema(IncrementBase):
    id: int
    class Config:
        orm_mode = True