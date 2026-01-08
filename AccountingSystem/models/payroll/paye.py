# models/paye.py
from sqlalchemy import Column, Integer, Date, Numeric, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class PayeTable(Base):
    __tablename__ = "paye_tables"
    id = Column(Integer, primary_key=True)
    start_date = Column(Date, nullable=False)
    end_date   = Column(Date, nullable=True)
    personal_relief = Column(Numeric(12,2), nullable=False, default=0)
    insurance_relief_rate = Column(Float, nullable=True)   # optional
    insurance_relief_cap  = Column(Numeric(12,2), nullable=True)
    bands = relationship("PayeBand", back_populates="table", cascade="all, delete-orphan",
                         order_by="PayeBand.lower")

class PayeBand(Base):
    __tablename__ = "paye_bands"
    id = Column(Integer, primary_key=True)
    table_id = Column(Integer, ForeignKey("paye_tables.id", ondelete="CASCADE"))
    lower = Column(Numeric(12,2), nullable=False)
    upper = Column(Numeric(12,2), nullable=True)  # NULL = infinity
    rate  = Column(Float, nullable=False)         # 0..1
    table = relationship("PayeTable", back_populates="bands")
