from sqlalchemy import Column, Integer, Date, Float
from database import Base

class AHLTable(Base):
    __tablename__ = "ahl_tables"
    id = Column(Integer, primary_key=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    employee_rate = Column(Float, nullable=False)
    employer_rate = Column(Float, nullable=False)
    relief_rate = Column(Float, nullable=True)
    relief_cap_month = Column(Integer, nullable=True)
