from sqlalchemy import Column, Integer, String, Text, ForeignKey
from database import Base

class EmployeeMeta(Base):
    __tablename__ = "employee_meta"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), index=True)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=True)
