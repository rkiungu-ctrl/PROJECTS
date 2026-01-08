# models/currency.py
from sqlalchemy import Column, Integer, String, Boolean, Numeric, DateTime, func, Index
from database import Base

class Currency(Base):
    __tablename__ = "currencies"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    symbol = Column(String(10))
    decimal_places = Column(Integer, nullable=False, default=2)
    rate_to_base = Column(Numeric(18, 8), nullable=False, default=1)
    is_base = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

# one base only (partial unique index)
Index(
    "ix_currencies_one_base",
    Currency.is_base,
    unique=True,
    sqlite_where=(Currency.is_base == True),
)
