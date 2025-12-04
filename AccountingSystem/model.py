from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, Boolean
from sqlalchemy.orm import relationship, declarative_base


Base = declarative_base()

class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoices"
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    invoice_date = Column(Date)
    total_amount = Column(Float)
    reference = Column(String)
    status = Column(String, default="Draft")
    is_recurring = Column(Boolean, default=False)
    recurrence_interval = Column(String, nullable=True)
    recurrence_end_date = Column(Date, nullable=True)

    # Correct relationship: back_populates matches attribute name in PurchaseInvoiceLine
    lines = relationship("PurchaseInvoiceLine", back_populates="purchase_invoices", cascade="all, delete-orphan")

class PurchaseInvoiceLine(Base):
    __tablename__ = "purchase_invoices_lines"
    id = Column(Integer, primary_key=True)
    purchase_invoices_id = Column(Integer, ForeignKey("purchase_invoices.id"))
    purchase_invoices = relationship("PurchaseInvoice", back_populates="lines")
    type = Column(String)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    item = Column(String, nullable=True)
    account_code = Column(String, nullable=True)
    description = Column(String)
    quantity = Column(Float)
    unit_price = Column(Float)
    vat_code = Column(String, nullable=True)
    excise_code = Column(String, nullable=True)

class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    # Add other fields as needed

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    is_service = Column(Integer)  # 0 or 1, or Boolean if you prefer
    # Add other fields as needed

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True)
    account_code = Column(String, unique=True)
    name = Column(String)
    type = Column(String)
    category = Column(String)
    sub_category = Column(String)
    description = Column(String)
    is_active = Column(Boolean, default=True)
    is_control_account = Column(Boolean, default=False)
    is_physical = Column(Boolean, default=False)  # <-- Add this line

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id = Column(Integer, primary_key=True)
    date = Column(Date)
    reference = Column(String)
    narration = Column(String)

class JournalLine(Base):
    __tablename__ = "journal_lines"
    id = Column(Integer, primary_key=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"))
    account_code = Column(String)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    narration = Column(String)
    debit = Column(Float)
    credit = Column(Float)

class CompanySettings(Base):
    __tablename__ = "company_settings"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    address = Column(String)
    email = Column(String)
    phone = Column(String)
    kra_pin = Column(String)

class Tax(Base):
    __tablename__ = "taxes"
    id = Column(Integer, primary_key=True)
    account_code = Column(String)
    type = Column(String)
    rate = Column(Float)
    start_date = Column(Date)
    end_date = Column(Date, nullable=True)

class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    date = Column(Date, nullable=False)
    type = Column(String, nullable=False)        # 'deposit' | 'withdrawal'
    amount = Column(Float, nullable=False)
    reference = Column(String, nullable=True)
    narration = Column(String, nullable=True)
    is_reconciled = Column(Boolean, default=False)
    cash_flow_type = Column(String, nullable=True)
    
    # Manager.io style categorization: separate WHO from WHAT
    payee = Column(String, nullable=True)  # WHO: Person/company (e.g., "ABC Plumbing Company")

    # 🔽🔽 add these two
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"))
    journal_entry = relationship("JournalEntry")

    # existing relation to the bank account
    account = relationship("Account", foreign_keys=[account_id])

    # counter account for double-entry bookkeeping
    counter_account_id = Column(Integer, ForeignKey("accounts.id"))  
    counter_account = relationship("Account", foreign_keys=[counter_account_id], primaryjoin="Account.id==BankTransaction.counter_account_id")

    def set_counter_account(self, new_counter):
        print("Setting counter_account_id to", new_counter.id)
        self.counter_account_id = new_counter.id

