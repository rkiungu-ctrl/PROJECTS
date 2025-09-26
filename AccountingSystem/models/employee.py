from sqlalchemy import Column, String, Float, Boolean, Integer, Date, LargeBinary
from sqlalchemy.orm import relationship
from database import Base
from pydantic import BaseModel

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    staff_no = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    personal_email = Column(String, nullable=True)  # Renamed from email
    official_email = Column(String, nullable=True)
    phone = Column(String, nullable=True)           # Mobile Phone No.
    office_phone = Column(String, nullable=True)
    country = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    county = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    kra_pin = Column(String, nullable=True)
    id_number = Column(String, nullable=True)
    nssf_number = Column(String, nullable=True)
    nhif_number = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    bank_account = Column(String, nullable=True)
    branch_name = Column(String, nullable=True)
    branch_code = Column(String, nullable=True)
    basic_salary = Column(Float, nullable=True)
    house_allowance = Column(Float, nullable=True)
    transport_allowance = Column(Float, nullable=True)
    other_allowances = Column(Float, nullable=True)
    commission = Column(Float, nullable=True)
    bonus = Column(Float, nullable=True)
    is_director = Column(Boolean, default=False)
    employment_type = Column(String, nullable=True)  # "permanent", "intern", "temporary"
    payment_currency = Column(String, nullable=True)
    work_shift = Column(String, nullable=True)
    off_days = Column(String, nullable=True)
    daily_hours = Column(Integer, nullable=True)
    hourly_rate = Column(Float, nullable=True)
    daily_rate = Column(Float, nullable=True)
    income_tax = Column(String, nullable=True)
    deduct_shif = Column(Integer, nullable=True)
    deduct_nssf = Column(Integer, nullable=True)
    deduct_housing_levy = Column(Integer, nullable=True)
    disability_exemption_amount = Column(Float, nullable=True)
    exemption_certificate_no = Column(String, nullable=True)
    mobile_money = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    marital_status = Column(String, nullable=True)
    dependants = Column(Integer, nullable=True)
    passport_photo = Column(LargeBinary, nullable=True)
    date_of_employment = Column(Date, nullable=True)
    contract_start = Column(Date, nullable=True)
    contract_end = Column(Date, nullable=True)
    job_title = Column(String, nullable=True)
    department = Column(String, nullable=True)
    reports_to = Column(String, nullable=True)  # staff_no of manager
    region = Column(String, nullable=True)
    project = Column(String, nullable=True)

    # ✅ Linked to Payroll records
    payrolls = relationship("Payroll", back_populates="employee")

class EmployeeSchema(BaseModel):
    id: int
    staff_no: str
    name: str
    phone: str
    email: str
    kra_pin: str
    id_number: str
    nssf_number: str
    nhif_number: str
    bank_name: str
    bank_account: str
    branch_name: str
    branch_code: str
    basic_salary: float
    house_allowance: float
    transport_allowance: float
    other_allowances: float
    commission: float
    bonus: float
    is_director: bool
    employment_type: str
    is_active: bool
    gender: str
    date_of_birth: str
    marital_status: str
    dependants: int

    class Config:
        orm_mode = True
