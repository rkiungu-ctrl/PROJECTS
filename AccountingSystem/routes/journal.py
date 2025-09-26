from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import JournalEntry, JournalLine, Account
from schemas.journal import CreateJournalEntry, JournalEntryOut

router = APIRouter(
    prefix="/journal/entries",
    tags=["Accounting"]
)

@router.get("/", response_model=List[JournalEntryOut])
def get_journal_entries(
    db: Session = Depends(get_db)
):
    entries = db.query(JournalEntry).all()
    for entry in entries:
        entry.lines  # preload relationships
    return entries


@router.post("/", response_model=JournalEntryOut)
def create_journal_entry(
    entry: CreateJournalEntry,
    db: Session = Depends(get_db)
):
    try:
        print("📥 Incoming Journal Entry Payload:")
        print(entry)

        # ✅ Validate that debits and credits are equal
        total_debit = sum(line.debit for line in entry.lines)
        total_credit = sum(line.credit for line in entry.lines)

        if total_debit != total_credit:
            raise HTTPException(status_code=400, detail="Debits and credits must balance.")

        # ✅ Create the main JournalEntry
        new_entry = JournalEntry(
            date=entry.date,
            reference=entry.reference,
            narration=entry.narration
        )
        db.add(new_entry)
        db.flush()  # assign ID before inserting lines

        # ✅ Process Journal Lines
        for line in entry.lines:
            account = db.query(Account).filter(Account.account_code == line.account_code).first()
            if not account:
                raise HTTPException(status_code=400, detail=f"Account code '{line.account_code}' not found.")

            db_line = JournalLine(
                journal_entry_id=new_entry.id,
                account_code=line.account_code,
                account_id=account.id,
                narration=line.narration,
                debit=line.debit,
                credit=line.credit
            )
            db.add(db_line)

        db.commit()
        db.refresh(new_entry)
        return new_entry

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


# ✅ Reusable helper function for internal posting
def post_journal_entry(
    db: Session,
    date,
    reference,
    narration,
    lines: List[dict]
):
    total_debit = sum(line.get("debit", 0.0) for line in lines)
    total_credit = sum(line.get("credit", 0.0) for line in lines)
    if total_debit != total_credit:
        raise HTTPException(status_code=400, detail="Debits and credits must balance.")

    journal = JournalEntry(date=date, reference=reference, narration=narration)
    db.add(journal)
    db.flush()

    for line in lines:
        account_code = line.get("account_code")
        account = db.query(Account).filter(Account.account_code == account_code).first()
        if not account:
            raise HTTPException(status_code=400, detail=f"Account code '{account_code}' not found.")

        db_line = JournalLine(
            journal_entry_id=journal.id,
            account_id=account.id,
            account_code=account.account_code,
            narration=line.get("narration", ""),
            debit=line.get("debit", 0.0),
            credit=line.get("credit", 0.0)
        )
        db.add(db_line)

    db.commit()
    db.refresh(journal)
    return journal
