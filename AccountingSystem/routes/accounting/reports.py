# routes/reports.py
from datetime import date, datetime, timedelta
from typing import Optional, Dict, Any, List
from io import BytesIO, StringIO
import csv

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from database import get_db
from models.account import Account
from models.journal import JournalEntry, JournalLine  # adjust if your names differ

# ---- PDF (ReportLab) ----
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    REPORTLAB_OK = True
except Exception:
    REPORTLAB_OK = False

router = APIRouter(prefix="/reports", tags=["Reporting"])

NORMAL_CREDIT = {"Liability", "Equity", "Income"}
NORMAL_DEBIT = {"Asset", "Expense"}

class DashboardSummary(BaseModel):
    period: str
    revenue: float
    expenses: float
    net_profit: float


def _get_period_range(period: str) -> tuple[Optional[date], Optional[date]]:
    """Return (start_date, end_date_exclusive) for a period key."""
    today = date.today()

    def first_of_next_month(d: date) -> date:
        # jump to somewhere in next month then back to day 1
        return (d.replace(day=28) + timedelta(days=4)).replace(day=1)

    period = (period or "").lower()

    if period == "this_month":
        start = today.replace(day=1)
        end = first_of_next_month(start)

    elif period == "last_month":
        this_month_start = today.replace(day=1)
        start = (this_month_start - timedelta(days=1)).replace(day=1)
        end = this_month_start

    elif period == "this_quarter":
        # quarters: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec
        q = (today.month - 1) // 3  # 0–3
        start_month = q * 3 + 1
        start = date(today.year, start_month, 1)
        # first day of the next quarter
        if start_month == 10:
            end = date(today.year + 1, 1, 1)
        else:
            end = date(today.year, start_month + 3, 1)

    elif period == "ytd":
        start = date(today.year, 1, 1)
        end = today + timedelta(days=1)  # inclusive of today

    else:
        # fallback: everything (no date filter)
        return None, None

    return start, end


@router.get("/dashboard-summary", response_model=DashboardSummary)
def get_dashboard_summary(
    period: str = Query("this_month"),
    db: Session = Depends(get_db),
):
    start, end = _get_period_range(period)

    # Income/Revenue types - adjust these based on your account types
    income_types = ["Income"]
    expense_types = ["Expense"]

    # Base query for journal lines with entries and accounts
    q_base = (
        db.query(JournalLine, JournalEntry, Account)
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
    )

    if start and end:
        q_base = q_base.filter(JournalEntry.date >= start, JournalEntry.date < end)

    # Revenue = credits - debits on income accounts
    income_lines = q_base.filter(Account.type.in_(income_types)).all()
    total_revenue = 0.0
    for line, _, _ in income_lines:
        total_revenue += float(line.credit or 0) - float(line.debit or 0)

    # Expenses = debits - credits on expense accounts
    expense_lines = q_base.filter(Account.type.in_(expense_types)).all()
    total_expenses = 0.0
    for line, _, _ in expense_lines:
        total_expenses += float(line.debit or 0) - float(line.credit or 0)

    net_profit = total_revenue - total_expenses

    return DashboardSummary(
        period=period,
        revenue=total_revenue,
        expenses=total_expenses,
        net_profit=net_profit,
    )


def as_date(s: str) -> date:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid date '{s}'. Use YYYY-MM-DD.")

def signed_amount(acc_type: str, debit: float, credit: float) -> float:
    debit = debit or 0.0
    credit = credit or 0.0
    return (debit - credit) if acc_type in NORMAL_DEBIT else (credit - debit)

def _apply_optional_filters(q, account_alias=None, entry_alias=None, line_alias=None,
                            account_group: Optional[str]=None,
                            tag: Optional[str]=None,
                            project: Optional[str]=None):
    """Safely apply filters only if corresponding columns exist."""
    # Account group (e.g., parent group or category on Account)
    if account_group and account_alias is not None and hasattr(account_alias, "group"):
        q = q.filter(account_alias.group == account_group)
    elif account_group and account_alias is not None and hasattr(account_alias, "category"):
        q = q.filter(account_alias.category == account_group)

    # Tag / Project often live on JournalEntry (or JournalLine)
    if tag:
        if entry_alias is not None and hasattr(entry_alias, "tag"):
            q = q.filter(entry_alias.tag == tag)
        elif line_alias is not None and hasattr(line_alias, "tag"):
            q = q.filter(line_alias.tag == tag)

    if project:
        if entry_alias is not None and hasattr(entry_alias, "project"):
            q = q.filter(entry_alias.project == project)
        elif line_alias is not None and hasattr(line_alias, "project"):
            q = q.filter(line_alias.project == project)

    return q

def sum_lines_by_account(db: Session, start: Optional[date], end: Optional[date],
                         account_group: Optional[str]=None,
                         tag: Optional[str]=None,
                         project: Optional[str]=None) -> Dict[int, Dict[str, Any]]:
    # Main totals query
    q = (
        db.query(
            JL_ACCOUNT_FK.label("account_fk"),
            func.coalesce(func.sum(JournalLine.debit), 0.0).label("debit"),
            func.coalesce(func.sum(JournalLine.credit), 0.0).label("credit"),
        )
        .join(JournalEntry, JournalEntry.id == JL_ENTRY_FK)
    )
    q = _join_account_on_fk(q)
    q = q.group_by(JL_ACCOUNT_FK)

    data = {}
    for row in q.all():
        data[row.account_fk] = {
            "debit": float(row.debit or 0.0),
            "credit": float(row.credit or 0.0)
        }
    return data

# Opening totals by account
def opening_totals_by_account(db, start, account_group=None, tag=None, project=None):
    q = (
        db.query(
            JL_ACCOUNT_FK.label("account_fk"),
            func.coalesce(func.sum(JournalLine.debit), 0.0).label("debit"),
            func.coalesce(func.sum(JournalLine.credit), 0.0).label("credit"),
        )
        .join(JournalEntry, JournalEntry.id == JL_ENTRY_FK)
        .filter(JournalEntry.date < start)
    )
    q = _apply_optional_filters(q, account_alias=Account, entry_alias=JournalEntry, line_alias=JournalLine,
                               account_group=account_group, tag=tag, project=project)
    q = _join_account_on_fk(q)
    q = q.group_by(JL_ACCOUNT_FK)

    data = {}
    for row in q.all():
        data[row.account_fk] = {
            "debit": float(row.debit or 0.0),
            "credit": float(row.credit or 0.0)
        }
    return data

# -------------------- Trial Balance (unchanged logic, but filterable) --------------------

@router.get("/trial-balance")
def trial_balance(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    account_group: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    start_d = as_date(start) if start else None
    end_d = as_date(end) if end else None

    period_lines = sum_lines_by_account(db, start_d, end_d, account_group, tag, project)
    open_lines = opening_totals_by_account(db, start_d, account_group, tag, project) if start_d else {}

    accounts = db.query(Account).all()
    rows = []
    total_debits = 0.0
    total_credits = 0.0

    for acc in accounts:
        op = open_lines.get(acc.id, {"debit": 0.0, "credit": 0.0})
        pr = period_lines.get(acc.id, {"debit": 0.0, "credit": 0.0})

        opening = signed_amount(acc.type, op["debit"], op["credit"])
        closing = opening + signed_amount(acc.type, pr["debit"], pr["credit"])

        rows.append({
            "account_code": acc.account_code,
            "account_name": acc.name,
            "type": acc.type,
            "opening": round(opening, 2),
            "debits": round(pr["debit"], 2),
            "credits": round(pr["credit"], 2),
            "closing": round(closing, 2),
        })
        total_debits += pr["debit"]
        total_credits += pr["credit"]

    return {
        "start": start,
        "end": end,
        "filters": {"account_group": account_group, "tag": tag, "project": project},
        "rows": rows,
        "totals": {
            "debits": round(total_debits, 2),
            "credits": round(total_credits, 2),
        },
    }

# -------------------- Profit & Loss (filterable) --------------------

@router.get("/profit-and-loss")
def profit_and_loss(
    start: str = Query(...),
    end: str = Query(...),
    account_group: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    start_d = as_date(start)
    end_d = as_date(end)

    period_lines = sum_lines_by_account(db, start_d, end_d, account_group, tag, project)
    acc_map = {a.id: a for a in db.query(Account).all()}

    income_rows, expense_rows = [], []
    total_income, total_expense = 0.0, 0.0

    for acc_id, vals in period_lines.items():
        acc = acc_map.get(acc_id)
        if not acc:
            continue
        val = signed_amount(acc.type, vals["debit"], vals["credit"])

        if acc.type == "Income":
            income_rows.append({"code": acc.account_code, "name": acc.name, "amount": round(val, 2)})
            total_income += val
        elif acc.type == "Expense":
            expense_rows.append({"code": acc.account_code, "name": acc.name, "amount": round(val, 2)})
            total_expense += val

    net_profit = total_income - total_expense
    income_rows.sort(key=lambda r: r["code"])
    expense_rows.sort(key=lambda r: r["code"])

    return {
        "start": start,
        "end": end,
        "filters": {"account_group": account_group, "tag": tag, "project": project},
        "income": {"rows": income_rows, "total": round(total_income, 2)},
        "expenses": {"rows": expense_rows, "total": round(total_expense, 2)},
        "net_profit": round(net_profit, 2),
    }

# -------------------- Balance Sheet (filterable) --------------------

@router.get("/balance-sheet")
def balance_sheet(
    as_of: str = Query(...),
    account_group: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    end_d = as_date(as_of)

    period_lines = sum_lines_by_account(db, None, end_d, account_group, tag, project)
    acc_map = {a.id: a for a in db.query(Account).all()}

    assets, liabilities, equity = [], [], []
    total_assets = total_liab = total_equity = 0.0

    for acc_id, vals in period_lines.items():
        acc = acc_map.get(acc_id)
        if not acc:
            continue
        bal = signed_amount(acc.type, vals["debit"], vals["credit"])
        row = {"code": acc.account_code, "name": acc.name, "amount": round(bal, 2)}

        if acc.type == "Asset":
            assets.append(row); total_assets += bal
        elif acc.type == "Liability":
            liabilities.append(row); total_liab += bal
        elif acc.type == "Equity":
            equity.append(row); total_equity += bal

    for lst in (assets, liabilities, equity):
        lst.sort(key=lambda r: r["code"])

    return {
        "as_of": as_of,
        "filters": {"account_group": account_group, "tag": tag, "project": project},
        "assets": {"rows": assets, "total": round(total_assets, 2)},
        "liabilities": {"rows": liabilities, "total": round(total_liab, 2)},
        "equity": {"rows": equity, "total": round(total_equity, 2)},
        "balance_check": round(total_assets - (total_liab + total_equity), 2),
    }

# ============================ EXPORTS =========================================

def _csv_response(filename: str, headers: List[str], rows: List[List[Any]]) -> Response:
    sio = StringIO()
    # Add BOM for Excel to recognize UTF-8
    sio.write("\ufeff")
    writer = csv.writer(sio)
    writer.writerow(headers)
    writer.writerows(rows)
    data = sio.getvalue().encode("utf-8")
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

def _pdf_table(title: str, subtitle: str, headers: List[str], rows: List[List[Any]]) -> bytes:
    if not REPORTLAB_OK:
        raise HTTPException(status_code=500, detail="ReportLab is not installed on the server.")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=1*cm, rightMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    elems = [
        Paragraph(f"<b>{title}</b>", styles["Title"]),
        Spacer(1, 6),
        Paragraph(subtitle, styles["Normal"]),
        Spacer(1, 12),
    ]

    data = [headers] + rows
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#f3f4f6")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.black),
        ("ALIGN", (0,0), (-1,-1), "LEFT"),
        ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#fafafa")]),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
    ]))
    elems.append(table)
    doc.build(elems)
    return buf.getvalue()

@router.get("/profit-and-loss/export")
def export_profit_and_loss(
    start: str = Query(...),
    end: str = Query(...),
    format: str = Query("csv", regex="^(csv|pdf)$"),
    account_group: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    pl = profit_and_loss(start, end, account_group, tag, project, db)

    if format == "csv":
        headers = ["Code", "Account", "Section", "Amount"]
        rows = []
        for r in pl["income"]["rows"]:
            rows.append([r["code"], r["name"], "Income", r["amount"]])
        for r in pl["expenses"]["rows"]:
            rows.append([r["code"], r["name"], "Expense", r["amount"]])
        rows += [
            ["", "", "Total Income", pl["income"]["total"]],
            ["", "", "Total Expenses", pl["expenses"]["total"]],
            ["", "", "Net Profit", pl["net_profit"]],
        ]
        return _csv_response(f"profit_and_loss_{start}_{end}.csv", headers, rows)

    # PDF
    headers = ["Code", "Account", "Section", "Amount"]
    rows = []
    for r in pl["income"]["rows"]:
        rows.append([r["code"], r["name"], "Income", f'{r["amount"]:,.2f}'])
    rows.append(["", "", "Total Income", f'{pl["income"]["total"]:,.2f}'])
    rows.append(["", "", "", ""])
    for r in pl["expenses"]["rows"]:
        rows.append([r["code"], r["name"], "Expense", f'{r["amount"]:,.2f}'])
    rows.append(["", "", "Total Expenses", f'{pl["expenses"]["total"]:,.2f}'])
    rows.append(["", "", "", ""])
    rows.append(["", "", "Net Profit", f'{pl["net_profit"]:,.2f}'])

    pdf_bytes = _pdf_table(
        "Profit & Loss Statement",
        f"Period: {start} to {end}",
        headers,
        rows
    )
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="profit_and_loss_{start}_{end}.pdf"'})

@router.get("/balance-sheet/export")
def export_balance_sheet(
    as_of: str = Query(...),
    format: str = Query("csv", regex="^(csv|pdf)$"),
    account_group: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    bs = balance_sheet(as_of, account_group, tag, project, db)

    if format == "csv":
        headers = ["Code", "Account", "Section", "Amount"]
        rows = []
        for r in bs["assets"]["rows"]:
            rows.append([r["code"], r["name"], "Assets", r["amount"]])
        rows.append(["", "", "Total Assets", bs["assets"]["total"]])
        rows.append(["", "", "", ""])
        for r in bs["liabilities"]["rows"]:
            rows.append([r["code"], r["name"], "Liabilities", r["amount"]])
        rows.append(["", "", "Total Liabilities", bs["liabilities"]["total"]])
        for r in bs["equity"]["rows"]:
            rows.append([r["code"], r["name"], "Equity", r["amount"]])
        rows.append(["", "", "Total Equity", bs["equity"]["total"]])
        rows.append(["", "", "", ""])
        rows.append(["", "", "Balance Check (A - (L+E))", bs["balance_check"]])

        return _csv_response(f"balance_sheet_{as_of}.csv", headers, rows)

    # PDF
    headers = ["Code", "Account", "Section", "Amount"]
    rows = []
    for r in bs["assets"]["rows"]:
        rows.append([r["code"], r["name"], "Assets", f'{r["amount"]:,.2f}'])
    rows.append(["", "", "Total Assets", f'{bs["assets"]["total"]:,.2f}'])
    rows.append(["", "", "", ""])
    for r in bs["liabilities"]["rows"]:
        rows.append([r["code"], r["name"], "Liabilities", f'{r["amount"]:,.2f}'])
    rows.append(["", "", "Total Liabilities", f'{bs["liabilities"]["total"]:,.2f}'])
    for r in bs["equity"]["rows"]:
        rows.append([r["code"], r["name"], "Equity", f'{r["amount"]:,.2f}'])
    rows.append(["", "", "Total Equity", f'{bs["equity"]["total"]:,.2f}'])
    rows.append(["", "", "", ""])
    rows.append(["", "", "Balance Check (A - (L+E))", f'{bs["balance_check"]:,.2f}'])

    pdf_bytes = _pdf_table(
        "Balance Sheet",
        f"As of: {as_of}",
        headers,
        rows
    )
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="balance_sheet_{as_of}.pdf"'})

# ---- dynamic column detection (JournalLine FKs) ------------------------------
def _jl_col(attr: str):
    # Return the column object if it exists, else None
    return getattr(JournalLine, attr, None)

# Try common FK names for the link to JournalEntry
JL_ENTRY_FK = next(
    (c for c in (_jl_col("entry_id"), _jl_col("journal_entry_id"), _jl_col("journal_id")) if c is not None),
    None
)
if JL_ENTRY_FK is None:
    raise RuntimeError(
        "Cannot find JournalLine → JournalEntry FK. Tried: entry_id, journal_entry_id, journal_id"
    )

# Try common FK names for the link to Account
JL_ACCOUNT_FK = next(
    (c for c in (_jl_col("account_id"), _jl_col("account_code"), _jl_col("accountid")) if c is not None),
    None
)
if JL_ACCOUNT_FK is None:
    raise RuntimeError(
        "Cannot find JournalLine → Account FK. Tried: account_id, account_code, accountid"
    )

# How to join to Account depending on FK type (id vs code)
def _join_account_on_fk(query):
    if JL_ACCOUNT_FK.key in ("account_code",):
        return query.join(Account, Account.code == JL_ACCOUNT_FK)
    else:
        return query.join(Account, Account.id == JL_ACCOUNT_FK)
