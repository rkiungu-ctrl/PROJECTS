from sqlalchemy import Column, Integer, Float, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
import datetime

class StockEntry(Base):
    __tablename__ = "stock_entries"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    date = Column(Date, default=datetime.date.today)
    quantity = Column(Float, nullable=False)
    type = Column(String, nullable=False)  # IN or OUT
    reference = Column(String, nullable=True)
    remarks = Column(String, nullable=True)

    product = relationship("Product", backref="stock_entries")
