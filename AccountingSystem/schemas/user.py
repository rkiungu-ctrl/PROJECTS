import pydantic as _pyd
from pydantic import BaseModel, ConfigDict

# ---------- User Schemas Only (Roles removed) ----------

class UserCreate(BaseModel):
    username: str
    role: str  # Role is now just a simple string field

class UserOut(BaseModel):
    username: str
    role: str
    # pydantic v2 model_config for attribute-based serialization
    model_config = ConfigDict(from_attributes=True, orm_mode=True)

    # Backwards-compatibility shim for pydantic v1
    if _pyd.__version__.split('.')[0] == '1':
        class Config:
            orm_mode = True
