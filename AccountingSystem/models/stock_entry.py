# models/stock_entry.py
from sqlalchemy import Column, Integer, Date, Float, String, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class StockEntry(Base):
    __tablename__ = "stock_entries"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False)
    date = Column(Date, nullable=False)
    quantity = Column(Float, nullable=False, default=0.0)
    type = Column(String, nullable=False)  # "IN" / "OUT"
    reference = Column(String, nullable=True)
    remarks = Column(String, nullable=True)

    # ✅ singular FK column name (matches how we reference one invoice)
    purchase_invoice_id = Column(
        Integer,
        ForeignKey("purchase_invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    product = relationship("Product", backref="stock_entries")
    invoice = relationship("PurchaseInvoice", primaryjoin="StockEntry.purchase_invoice_id==PurchaseInvoice.id", viewonly=True)
