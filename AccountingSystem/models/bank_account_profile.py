# models/bank_account_profile.py
from sqlalchemy import Column, Integer, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base

class BankAccountProfile(Base):
    __tablename__ = "bank_accounts_v2"

    id = Column(Integer, primary_key=True, index=True)

    # link to COA account row (1142–1149, 1151+)
    account_id = Column(Integer, ForeignKey("accounts.id"), unique=True, nullable=False)

    # link to currencies table
    currency_id = Column(Integer, ForeignKey("currencies.id"), nullable=False)

    is_active = Column(Boolean, nullable=False, default=True)

    account = relationship("Account")
    currency = relationship("Currency")

    __table_args__ = (
        UniqueConstraint("account_id", name="uq_bank_accounts_v2_account_id"),
    )
