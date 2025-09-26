from pydantic import BaseModel

# ---------- User Schemas Only (Roles removed) ----------

class UserCreate(BaseModel):
    username: str
    role: str  # Role is now just a simple string field

class UserOut(BaseModel):
    username: str
    role: str

    class Config:
        orm_mode = True
