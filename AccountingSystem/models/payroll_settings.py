from sqlalchemy import Column, Integer, Float, Date, String
from database import Base

class PayrollSetting(Base):
    __tablename__ = "payroll_settings"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    value = Column(Float)
    start_date = Column(Date)
    end_date = Column(Date)