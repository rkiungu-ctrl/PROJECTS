from sqlalchemy import Column, Integer, Float, Date, ForeignKey, String
from sqlalchemy.orm import relationship
from database import Base
from models.nhif_band import NHIFBand
from models.shif_setting import SHIFSetting

class Payroll(Base):
    __tablename__ = "payrolls"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    period = Column(Date)

    basic_salary = Column(Float, default=0)
    house_allowance = Column(Float, default=0)
    transport_allowance = Column(Float, default=0)
    other_allowances = Column(Float, default=0)
    commission = Column(Float, default=0)
    bonus = Column(Float, default=0)

    gross_pay = Column(Float, default=0)
    taxable_pay = Column(Float, default=0)
    shif = Column(Float, default=0)
    nssf = Column(Float, default=0)
    paye = Column(Float, default=0)
    ahl = Column(Float, default=0)
    loan = Column(Float, default=0)
    advance = Column(Float, default=0)
    net_pay = Column(Float, default=0)

    # ✅ Employer contributions
    ahl_employer = Column(Float, default=0)
    nssf_employer = Column(Float, default=0)
    nita_employer = Column(Float, default=0)

    # ✅ Link to journal
    payroll_journal_ref = Column(String, nullable=True)

    # ✅ Relationship with Employee model
    employee = relationship("Employee", back_populates="payrolls")

def get_health_deduction(gross_salary: float, payroll_date, db) -> float:
    shif = db.query(SHIFSetting).filter(
        SHIFSetting.start_date <= payroll_date,
        (SHIFSetting.end_date == None) | (SHIFSetting.end_date >= payroll_date)
    ).first()
    if shif:
        return min(gross_salary * shif.rate, shif.cap)
    nhif_band = db.query(NHIFBand).filter(
        NHIFBand.start_date <= payroll_date,
        (NHIFBand.end_date == None) | (NHIFBand.end_date >= payroll_date),
        NHIFBand.lower_limit <= gross_salary,
        NHIFBand.upper_limit >= gross_salary
    ).first()
    return nhif_band.deduction if nhif_band else 0
