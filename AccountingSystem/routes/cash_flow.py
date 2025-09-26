from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import BankTransaction
from fastapi.responses import StreamingResponse
from datetime import date
import io
import csv

router = APIRouter(
    prefix="/reports",
    tags=["Banking"]
)

@router.get("/",)
def get_cash_flow(
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(BankTransaction)
    if start_date:
        query = query.filter(BankTransaction.date >= start_date)
    if end_date:
        query = query.filter(BankTransaction.date <= end_date)

    transactions = query.all()

    totals = {
        'operating': {'inflows': 0, 'outflows': 0},
        'investing': {'inflows': 0, 'outflows': 0},
        'financing': {'inflows': 0, 'outflows': 0}
    }

    for tx in transactions:
        category = tx.cash_flow_type or "operating"
        if category not in totals:
            continue

        if tx.type == 'deposit':
            totals[category]['inflows'] += tx.amount
        else:
            totals[category]['outflows'] += tx.amount

    return {
        "period": f"{start_date} to {end_date}" if start_date and end_date else "All Time",
        "operating_activities": totals['operating'],
        "investing_activities": totals['investing'],
        "financing_activities": totals['financing'],
        "net_cash_flow": sum([
            totals['operating']['inflows'] - totals['operating']['outflows'],
            totals['investing']['inflows'] - totals['investing']['outflows'],
            totals['financing']['inflows'] - totals['financing']['outflows'],
        ])
    }

@router.get("/export/csv",)
def export_cash_flow_csv(
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db)
):
    data = get_cash_flow(start_date=start_date, end_date=end_date, db=db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Category", "Inflows", "Outflows", "Net"])

    for key in ['operating_activities', 'investing_activities', 'financing_activities']:
        section = data[key]
        writer.writerow([
            key.replace("_", " ").title(),
            section['inflows'],
            section['outflows'],
            section['inflows'] - section['outflows']
        ])

    writer.writerow([])
    writer.writerow(["Net Cash Flow", "", "", data["net_cash_flow"]])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cash_flow_report.csv"}
    )
