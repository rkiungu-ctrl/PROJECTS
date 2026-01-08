# models/purchase_invoice.py
from sqlalchemy import Column, Integer, String, Date, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

__all__ = ["PurchaseInvoice", "PurchaseInvoiceLine"]

class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoices"  # plural table

    id = Column(Integer, primary_key=True, index=True)

    # core fields
    supplier_id = Column(Integer, index=True, nullable=False)
    invoice_date = Column(Date, nullable=False)
    reference = Column(String, nullable=True)
    status = Column(String, nullable=True)

    # totals / amounts
    total_amount = Column(Float, nullable=True, default=0.0)
    amount_paid = Column(Float, nullable=True, default=0.0)

    # currency
    currency_code = Column(String, nullable=True)
    exchange_rate = Column(Float, nullable=True, default=1.0)
    cu_inv_number = Column(String, nullable=True)

    # recurring
    is_recurring = Column(Boolean, nullable=True, default=False)
    recurrence_interval = Column(String, nullable=True)
    recurrence_end_date = Column(Date, nullable=True)
    next_issue_date = Column(Date, nullable=True)

    # relationship to lines (plural table + correct FK name)
    lines = relationship(
        "PurchaseInvoiceLine",
        back_populates="invoice",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PurchaseInvoiceLine(Base):
    __tablename__ = "purchase_invoice_lines"  # plural table

    id = Column(Integer, primary_key=True, index=True)

    # FK points to plural header table and uses the current FK column name
    purchase_invoice_id = Column(
        Integer,
        ForeignKey("purchase_invoices.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # current column names (match your plural table schema)
    type = Column(String, nullable=True)             # "Product" / "Service"
    product_id = Column(Integer, nullable=True)
    item = Column(String, nullable=True)
    account_code = Column(String, nullable=True)
    description = Column(String, nullable=True)
    quantity = Column(Float, nullable=True, default=0.0)
    unit_price = Column(Float, nullable=True, default=0.0)
    vat_code = Column(String, nullable=True)
    excise_code = Column(String, nullable=True)
    vat = Column(Float, nullable=True, default=0.0)  # VAT amount for this line
    is_vat_inclusive = Column(Boolean, nullable=True, default=False)  # Is the line amount VAT inclusive?

    # relationship back to header
    invoice = relationship("PurchaseInvoice", back_populates="lines")
