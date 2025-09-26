from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from fastapi.responses import StreamingResponse
import io
import csv

from database import get_db
import models

router = APIRouter(
    prefix="/reports",
    tags=["Accounting"]
)

# ---------- TRIAL BALANCE ----------
@router.get("/trial-balance/")
def get_trial_balance(
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(
        models.JournalLine.account_code,
        models.Account.name.label("account_name"),
        func.sum(models.JournalLine.debit).label("debit"),
        func.sum(models.JournalLine.credit).label("credit")
    ).join(models.Account, models.JournalLine.account_id == models.Account.id)

    if start_date and end_date:
        query = query.join(models.JournalEntry).filter(
            models.JournalEntry.date >= start_date,
            models.JournalEntry.date <= end_date
        )

    query = query.group_by(models.JournalLine.account_code, models.Account.name)
    results = query.all()

    return [
        {
            "account_code": row.account_code,
            "account_name": row.account_name,
            "debit": float(row.debit or 0),
            "credit": float(row.credit or 0)
        }
        for row in results
    ]


@router.get("/trial-balance/export/csv")
def export_trial_balance_csv(
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db)
):
    data = get_trial_balance(start_date, end_date, db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Account Code", "Account Name", "Debit", "Credit"])

    for row in data:
        writer.writerow([row["account_code"], row["account_name"], row["debit"], row["credit"]])

    output.seek(0)
    return StreamingResponse(output, media_type="text/csv", headers={
        "Content-Disposition": "attachment; filename=trial_balance.csv"
    })


# ---------- PROFIT & LOSS ----------
@router.get("/profit-loss/")
def get_profit_loss(
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db)
):
    query = (
        db.query(
            models.JournalLine.account_code,
            models.Account.name.label("account_name"),
            models.Account.type.label("account_type"),
            func.sum(models.JournalLine.debit).label("debit"),
            func.sum(models.JournalLine.credit).label("credit")
        )
        .join(models.Account, models.JournalLine.account_id == models.Account.id)
        .join(models.JournalEntry, models.JournalLine.journal_entry_id == models.JournalEntry.id)
    )

    if start_date and end_date:
        query = query.filter(
            models.JournalEntry.date >= start_date,
            models.JournalEntry.date <= end_date
        )

    results = query.group_by(
        models.JournalLine.account_code,
        models.Account.name,
        models.Account.type
    ).all()

    income, expense = [], []
    total_income, total_expense = 0, 0

    for row in results:
        amount = float(row.credit or 0) - float(row.debit or 0)
        entry = {"account_code": row.account_code, "account_name": row.account_name, "amount": abs(amount)}

        if row.account_type == "Income":
            income.append(entry)
            total_income += amount
        elif row.account_type == "Expense":
            expense.append(entry)
            total_expense += abs(amount)

    return {
        "income": income,
        "expense": expense,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_profit": total_income - total_expense
    }


@router.get("/profit-loss/export/csv")
def export_profit_loss_csv(
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db)
):
    data = get_profit_loss(start_date, end_date, db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Type", "Account Code", "Account Name", "Amount"])

    for row in data["income"]:
        writer.writerow(["Income", row["account_code"], row["account_name"], row["amount"]])
    for row in data["expense"]:
        writer.writerow(["Expense", row["account_code"], row["account_name"], row["amount"]])

    writer.writerow([])
    writer.writerow(["Total Income", "", "", data["total_income"]])
    writer.writerow(["Total Expense", "", "", data["total_expense"]])
    writer.writerow(["Net Profit", "", "", data["net_profit"]])

    output.seek(0)
    return StreamingResponse(output, media_type="text/csv", headers={
        "Content-Disposition": "attachment; filename=profit_and_loss.csv"
    })


# ---------- LEDGER ----------
@router.get("/ledger/{account_code}")
def get_ledger(
    account_code: str,
    db: Session = Depends(get_db)
):
    lines = (
        db.query(
            models.JournalEntry.date,
            models.JournalEntry.reference,
            models.JournalLine.narration,
            models.JournalLine.debit,
            models.JournalLine.credit
        )
        .join(models.JournalEntry, models.JournalLine.journal_entry_id == models.JournalEntry.id)
        .filter(models.JournalLine.account_code == account_code)
        .order_by(models.JournalEntry.date, models.JournalLine.id)
        .all()
    )

    balance = 0
    ledger = []
    for line in lines:
        balance += line.debit - line.credit
        ledger.append({
            "date": line.date,
            "reference": line.reference,
            "narration": line.narration,
            "debit": float(line.debit),
            "credit": float(line.credit),
            "balance": float(balance)
        })
    return ledger


# ---------- BALANCE SHEET ----------
@router.get("/balance-sheet/")
def get_balance_sheet(
    as_of: date = Query(None),
    db: Session = Depends(get_db)
):
    def fetch(section):
        accounts = db.query(models.Account).filter(func.lower(models.Account.type) == section).all()
        total, items = 0, []
        for acc in accounts:
            query = db.query(models.JournalLine).filter(models.JournalLine.account_id == acc.id)
            if as_of:
                query = query.join(models.JournalEntry).filter(models.JournalEntry.date <= as_of)
            lines = query.all()
            debit = sum(line.debit for line in lines)
            credit = sum(line.credit for line in lines)
            balance = debit - credit if section == "asset" else credit - debit
            items.append({
                "account_code": acc.account_code,
                "account_name": acc.name,
                "balance": balance
            })
            total += balance
        return items, total

    assets, total_assets = fetch("asset")
    liabilities, total_liabilities = fetch("liability")
    equity, total_equity = fetch("equity")

    return {
        "as_of": as_of or date.today(),
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "total_equity": total_equity,
        "balanced": round(total_assets, 2) == round(total_liabilities + total_equity, 2)
    }


@router.get("/balance-sheet/export/csv")
def export_balance_sheet_csv(
    as_of: date = Query(None),
    db: Session = Depends(get_db)
):
    data = get_balance_sheet(as_of, db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Category", "Account Code", "Account Name", "Balance"])

    for section in ["assets", "liabilities", "equity"]:
        for row in data[section]:
            writer.writerow([section.title(), row["account_code"], row["account_name"], row["balance"]])
        writer.writerow([])

    writer.writerow(["Total Assets", "", "", data["total_assets"]])
    writer.writerow(["Total Liabilities", "", "", data["total_liabilities"]])
    writer.writerow(["Total Equity", "", "", data["total_equity"]])
    writer.writerow(["Balanced", "", "", data["balanced"]])
    output.seek(0)
    return StreamingResponse(output, media_type="text/csv", headers={
        "Content-Disposition": "attachment; filename=balance_sheet.csv"
    })


@router.get("/balance-sheet/{section}/")
def get_section(
    section: str,
    as_of: date = Query(None),
    db: Session = Depends(get_db)
):
    normalized = section.lower().rstrip("s")
    if normalized not in ["asset", "liability", "equity"]:
        raise HTTPException(status_code=400, detail="Invalid section. Use asset, liability or equity.")

    accounts = db.query(models.Account).filter(models.Account.type.ilike(f"%{normalized}%")).all()
    if not accounts:
        raise HTTPException(status_code=404, detail=f"No {normalized} accounts found.")

    results, total = [], 0
    for acc in accounts:
        query = db.query(models.JournalLine).filter(models.JournalLine.account_id == acc.id)
        if as_of:
            query = query.join(models.JournalEntry).filter(models.JournalEntry.date <= as_of)
        lines = query.all()
        debit = sum(line.debit for line in lines)
        credit = sum(line.credit for line in lines)
        balance = debit - credit if normalized == "asset" else credit - debit
        results.append({
            "account_code": acc.account_code,
            "account_name": acc.name,
            "balance": balance
        })
        total += balance

    return {
        "as_of": as_of or date.today(),
        "accounts": results,
        "total": total
    }
