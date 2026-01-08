from sqlalchemy import Column, Integer, Float, Date
from database import Base

class NHIFBand(Base):
    __tablename__ = "nhif_bands"
    id = Column(Integer, primary_key=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    lower_limit = Column(Float, nullable=False)
    upper_limit = Column(Float, nullable=False)
    deduction = Column(Float, nullable=False)