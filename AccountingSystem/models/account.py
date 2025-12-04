from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)         # "Asset", "Liability", "Equity", "Income", "Expense"
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_control_account = Column(Boolean, default=False)
    is_physical = Column(Boolean, default=False)

    parent_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    parent = relationship("Account", remote_side=[id], backref="children")
    # ✅ Relationship for receipts (many receipts can reference one account)
    receipts = relationship("PaymentReceipt", back_populates="bank_account")

    @property
    def parent_account_code(self):
        return self.parent.account_code if self.parent else None


class AccountSettings(Base):
    __tablename__ = "account_settings"

    id = Column(Integer, primary_key=True, index=True)
    salaries_expense_account_id = Column(String)
    bonus_expense_account_id = Column(String)
    paye_payable_account_id = Column(String)
    nhif_payable_account_id = Column(String)
    nssf_employee_account_id = Column(String)
    ahl_employee_account_id = Column(String)
    net_pay_account_id = Column(String)
    nssf_employer_expense_account_id = Column(String)
    nssf_employer_liability_account_id = Column(String)
    ahl_employer_expense_account_id = Column(String)
    ahl_employer_liability_account_id = Column(String)
    nita_expense_account_id = Column(String)
    nita_payable_account_id = Column(String)
    # New settings for loans and employee clearing override
    loans_asset_account_id = Column(String, nullable=True)
    employee_clearing_account_id = Column(String, nullable=True)


