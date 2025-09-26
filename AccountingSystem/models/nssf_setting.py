# models/nssf_setting.py
from sqlalchemy import Column, Integer, Float, Date, Numeric
from sqlalchemy.ext.declarative import declarative_base

from database import Base  # use your existing Base

class NSSFSetting(Base):
    __tablename__ = "nssf_settings"

    id = Column(Integer, primary_key=True, index=True)

    # Period window (end_date can be NULL to mean "open-ended / current")
    start_date = Column(Date, nullable=False)
    end_date   = Column(Date, nullable=True)

    # Limits and rates
    lel = Column(Numeric(12, 2), nullable=False)  # Lower Earnings Limit
    uel = Column(Numeric(12, 2), nullable=False)  # Upper Earnings Limit
    rate_employee = Column(Float, nullable=False, default=0.06)  # 6%
    rate_employer = Column(Float, nullable=False, default=0.06)  # 6% (if you need it)

    # Precomputed caps (employee side)
    tier1_cap = Column(Numeric(12, 2), nullable=False)  # 6% * LEL
    tier2_cap = Column(Numeric(12, 2), nullable=False)  # 6% * (UEL - LEL)
    max_employee_total = Column(Numeric(12, 2), nullable=False)  # tier1 + tier2
