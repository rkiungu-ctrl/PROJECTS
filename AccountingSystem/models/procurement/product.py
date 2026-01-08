from sqlalchemy import Column, Integer, String, Float, Boolean
from database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, unique=True, nullable=False)
    unit_price = Column(Float, default=0.0)
    unit_of_measure = Column(String, default="pcs")
    opening_stock = Column(Float, default=0.0)
    is_service = Column(Boolean, default=False)
