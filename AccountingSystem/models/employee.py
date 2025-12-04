from sqlalchemy import Column, String, Float, Boolean, Integer, Date, LargeBinary
from sqlalchemy.orm import relationship
from database import Base
from pydantic import BaseModel
from models.increment import Increment

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    staff_no = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)

    # Emails / phones / address
    personal_email = Column(String, nullable=True)  # Renamed from email
    official_email = Column(String, nullable=True)
    phone = Column(String, nullable=True)           # Mobile Phone No.
    office_phone = Column(String, nullable=True)
    country = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    county = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)

    # KRA / IDs
    kra_pin = Column(String, nullable=True)
    id_number = Column(String, nullable=True)
    nssf_number = Column(String, nullable=True)
    nhif_number = Column(String, nullable=True)

    # Banking
    bank_name = Column(String, nullable=True)
    bank_account = Column(String, nullable=True)
    branch_name = Column(String, nullable=True)
    branch_code = Column(String, nullable=True)
    salary_processing_method = Column(String, nullable=True)  # ensure single definition

    # Pay and benefits
    basic_salary = Column(Float, nullable=True)
    house_allowance = Column(Float, nullable=True)
    transport_allowance = Column(Float, nullable=True)
    other_allowances = Column(Float, nullable=True)
    commission = Column(Float, nullable=True)
    bonus = Column(Float, nullable=True)
    is_director = Column(Boolean, default=False)

    # Employment / schedule
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

    # Personal
    gender = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    marital_status = Column(String, nullable=True)
    dependants = Column(Integer, nullable=True)
    passport_photo = Column(LargeBinary, nullable=True)

    # HR details
    date_of_employment = Column(Date, nullable=True)
    contract_start = Column(Date, nullable=True)
    contract_end = Column(Date, nullable=True)
    job_title = Column(String, nullable=True)
    department = Column(String, nullable=True)
    reports_to = Column(String, nullable=True)  # staff_no of manager
    head_of = Column(String, nullable=True)     # <-- NEW: Head of (e.g., Head of Sales)
    region = Column(String, nullable=True)
    project = Column(String, nullable=True)

    next_of_kin = Column(String, nullable=True)  # Store as JSON string

    # ✅ Linked to Payroll records
    payrolls = relationship("Payroll", back_populates="employee")

    # ✅ Linked to Increment records
    increments = relationship("Increment", back_populates="employee", cascade="all, delete-orphan")


# NOTE: This Pydantic class appears unused (your routes import from schemas.employee),
# but keeping it aligned to avoid confusion if referenced elsewhere.
class EmployeeSchema(BaseModel):
    id: int
    staff_no: str
    name: str
    phone: str
    personal_email: str
    kra_pin: str
    id_number: str
    nssf_number: str
    nhif_number: str
    bank_name: str
    bank_account: str
    branch_name: str
    branch_code: str
    salary_processing_method: str | None = None
    basic_salary: float
    house_allowance: float
    transport_allowance: float
    other_allowances: float
    commission: float
    bonus: float
    is_director: bool
    employment_type: str
    gender: str | None = None
    date_of_birth: str | None = None
    marital_status: str | None = None
    dependants: int | None = None
    payment_currency: str | None = None
    work_shift: str | None = None
    off_days: str | None = None
    daily_hours: int | None = None
    hourly_rate: float | None = None
    daily_rate: float | None = None
    income_tax: str | None = None
    deduct_shif: bool | None = None
    deduct_nssf: bool | None = None
    deduct_housing_levy: bool | None = None
    disability_exemption_amount: float | None = None
    exemption_certificate_no: str | None = None
    mobile_money: str | None = None
    job_title: str | None = None
    department: str | None = None
    reports_to: str | None = None
    head_of: str | None = None  # <-- NEW in schema mirror
    region: str | None = None
    date_of_employment: str | None = None
    contract_start: str | None = None
    contract_end: str | None = None
    project: str | None = None
    next_of_kin: list = []

    class Config:
        orm_mode = True
