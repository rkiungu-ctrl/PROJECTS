from sqlalchemy import Column, Integer, String
from database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    supplier_code = Column(String, nullable=True, unique=True, index=True)  # NEW
    name = Column(String, nullable=False)
    pin = Column(String, nullable=True)  # Supplier PIN for ETR
    contact_person = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    bank_branch = Column(String, nullable=True)
    bank_account_number = Column(String, nullable=True)
    bank_branch_code = Column(String, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "supplier_code": self.supplier_code,   # NEW
            "name": self.name,
            "pin": self.pin,                      # NEW
            "contact_person": self.contact_person,
            "phone": self.phone,
            "email": self.email,
            "address": self.address,
            "bank_name": self.bank_name,
            "bank_branch": self.bank_branch,
            "bank_account_number": self.bank_account_number,
            "bank_branch_code": self.bank_branch_code,
        }
