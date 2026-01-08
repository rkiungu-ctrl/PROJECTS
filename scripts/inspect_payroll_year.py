import argparse
from datetime import date
from decimal import Decimal
from pathlib import Path
import sys

# Import AccountingSystem modules
ROOT = Path(__file__).resolve().parents[1]
AS_DIR = ROOT / "AccountingSystem"
if str(AS_DIR) not in sys.path:
    sys.path.insert(0, str(AS_DIR))

from database import SessionLocal
from models.accounting.journal import JournalEntry, JournalLine
from models.settings.account import Account


def month_date(year: int, month: int) -> date:
    return date(year, month, 1)


def inspect_month(session, period: date):
    # Find journal by exact reference or by date+like reference
    ref = f"Payroll {period}"
    je = (
        session.query(JournalEntry)
        .filter(JournalEntry.reference == ref)
        .first()
    )
    if not je:
        je = (
            session.query(JournalEntry)
            .filter(JournalEntry.date == period)
            .filter(JournalEntry.reference.like("Payroll%"))
            .first()
        )
    if not je:
        return {"found": False}

    rows = (
        session.query(JournalLine, Account)
        .join(Account, JournalLine.account_id == Account.id)
        .filter(JournalLine.journal_entry_id == je.id)
        .order_by(JournalLine.id.asc())
        .all()
    )

    total_debit = Decimal("0")
    total_credit = Decimal("0")
    flags = {"HELB": False, "LOAN": False, "ADVANCE": False}

    for jl, acct in rows:
        total_debit += Decimal(str(jl.debit or 0))
        total_credit += Decimal(str(jl.credit or 0))
        nm = (acct.name or "").upper()
        if "HELB" in nm:
            flags["HELB"] = True
        if "LOAN" in nm and "HELB" not in nm:
            flags["LOAN"] = True
        if "ADV" in nm:
            flags["ADVANCE"] = True

    return {
        "found": True,
        "journal_id": je.id,
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
        "balanced": total_debit == total_credit,
        "flags": flags,
    }


def main(year: int, fix: bool):
    session = SessionLocal()
    try:
        summary = []
        for m in range(1, 13):
            p = month_date(year, m)
            res = inspect_month(session, p)
            if not res.get("found"):
                summary.append({"period": str(p), "found": False})
                print(f"{p}: no journal found")
                continue
            balanced = res["balanced"]
            flags = res["flags"]
            print(
                f"{p}: Dr {res['total_debit']:.2f} / Cr {res['total_credit']:.2f} • "
                f"Balanced={'Yes' if balanced else 'No'} • "
                f"HELB={'Yes' if flags['HELB'] else 'No'}, Loan={'Yes' if flags['LOAN'] else 'No'}, Advance={'Yes' if flags['ADVANCE'] else 'No'}"
            )
            summary.append({
                "period": str(p),
                "found": True,
                "balanced": balanced,
                "flags": flags,
            })
        # Quick totals
        total = len(summary)
        missing = sum(1 for s in summary if not s.get("found"))
        not_balanced = sum(1 for s in summary if s.get("found") and not s.get("balanced"))
        print("-" * 80)
        print(f"Year {year} summary: months={total}, missing={missing}, not_balanced={not_balanced}")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Inspect all payroll journals for a year")
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--fix", action="store_true", help="(reserved) re-post if imbalanced")
    args = ap.parse_args()
    raise SystemExit(main(args.year, args.fix))
