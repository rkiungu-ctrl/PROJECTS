from sqlalchemy import Column, Integer, Float, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Increment(Base):
    __tablename__ = "increments"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    start_date = Column(Date, nullable=False)
    gross_pay = Column(Float, nullable=False)

    employee = relationship("Employee", back_populates="increments")