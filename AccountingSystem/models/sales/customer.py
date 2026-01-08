from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    client_number = Column(Integer, unique=True, index=True, nullable=False)  # <-- ensure unique
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    kra_pin = Column(String, nullable=True)
    address = Column(String, nullable=True)

    # 🔗 Link to invoices
    invoices = relationship("Invoice", back_populates="customer")
