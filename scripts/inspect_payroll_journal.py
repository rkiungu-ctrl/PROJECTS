import argparse
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from pathlib import Path
import sys

# Ensure AccountingSystem package is importable when running from scripts/
ROOT = Path(__file__).resolve().parents[1]
AS_DIR = ROOT / "AccountingSystem"
if str(AS_DIR) not in sys.path:
    sys.path.insert(0, str(AS_DIR))

from database import SessionLocal
from models.accounting.journal import JournalEntry, JournalLine
from models.settings.account import Account


def parse_period(period_str: str) -> date:
    # Accept YYYY-MM or YYYY-MM-DD and normalize to first day of month
    if len(period_str) == 7 and period_str.count("-") == 1:
        period_str = f"{period_str}-01"
    return date.fromisoformat(period_str).replace(day=1)


def inspect_period(period: date):
    session: Session = SessionLocal()
    try:
        ref = f"Payroll {period}"
        je = (
            session.query(JournalEntry)
            .filter(JournalEntry.reference == ref)
            .first()
        )
        if not je:
            # Try by date + payroll-like reference
            je = (
                session.query(JournalEntry)
                .filter(JournalEntry.date == period)
                .filter(JournalEntry.reference.like("Payroll%"))
                .first()
            )
        if not je:
            print(f"No journal found for period {period}")
            return 2

        lines = (
            session.query(JournalLine, Account)
            .join(Account, JournalLine.account_id == Account.id)
            .filter(JournalLine.journal_entry_id == je.id)
            .order_by(JournalLine.id.asc())
            .all()
        )

        total_debit = Decimal("0")
        total_credit = Decimal("0")
        flags = {"HELB": False, "LOAN": False, "ADVANCE": False}

        print(f"Journal #{je.id} • {je.reference} • Date={je.date}")
        print("-" * 80)
        for jl, acct in lines:
            total_debit += Decimal(str(jl.debit or 0))
            total_credit += Decimal(str(jl.credit or 0))
            nm = (acct.name or "").upper()
            if "HELB" in nm:
                flags["HELB"] = True
            if "LOAN" in nm:
                # Avoid counting HELB as loan; rely on name not containing HELB
                if "HELB" not in nm:
                    flags["LOAN"] = True
            if "ADV" in nm:
                flags["ADVANCE"] = True
            print(f"{acct.account_code:>6}  {acct.name:<40}  Dr {jl.debit:>12.2f}  Cr {jl.credit:>12.2f}")

        print("-" * 80)
        print(f"Totals: Dr {total_debit:.2f} / Cr {total_credit:.2f}")
        print(
            "Present → "
            + ", ".join(
                [
                    f"HELB={'Yes' if flags['HELB'] else 'No'}",
                    f"Loan={'Yes' if flags['LOAN'] else 'No'}",
                    f"Advance={'Yes' if flags['ADVANCE'] else 'No'}",
                ]
            )
        )
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Inspect payroll journal by period")
    ap.add_argument("--period", required=True, help="YYYY-MM or YYYY-MM-DD")
    args = ap.parse_args()
    p = parse_period(args.period)
    raise SystemExit(inspect_period(p))
