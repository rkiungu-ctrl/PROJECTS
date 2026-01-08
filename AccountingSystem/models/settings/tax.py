from sqlalchemy import Column, Integer, String, Float, Date
from database import Base

class Tax(Base):
    __tablename__ = "taxes"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)       # e.g. 'VAT', 'EXCISE'
    rate = Column(Float, nullable=False)        # store as 0.16 for 16%
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    account_code = Column(String, nullable=True)

