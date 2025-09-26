from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    reference = Column(String, nullable=True)
    narration = Column(String, nullable=True)

    # ✅ Links one journal entry to many journal lines
    lines = relationship("JournalLine", back_populates="entry")


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id = Column(Integer, primary_key=True, index=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=False)
    account_code = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    narration = Column(String, nullable=True)
    debit = Column(Float, nullable=False, default=0.0)
    credit = Column(Float, nullable=False, default=0.0)

    # ✅ Link back to the parent journal entry
    entry = relationship("JournalEntry", back_populates="lines")

    # Optional: link to account (helpful for trial balance later)
    account = relationship("Account")
