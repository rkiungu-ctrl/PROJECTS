# routes/dashboard.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Invoice, JournalEntry, Payroll, Product, JournalLine, Account
from datetime import datetime, date

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)

@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    return {
        "message": "Dashboard is live ✅",
        "note": "Real stats will appear after you post invoices, payroll, bank txns, etc."
    }
