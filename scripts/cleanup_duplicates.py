import argparse
from datetime import datetime, date

from sqlalchemy.orm import Session

import sys
sys.path.append(str("c:/PROJECTS/AccountingSystem"))

from database import SessionLocal
import models
from models.bank_transaction_v2 import BankTransactionV2


def parse_date(s: str) -> date:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return datetime.fromisoformat(s).date()


def scan_duplicates(db: Session, account_id: int, start_date: date, end_date: date):
    BT = BankTransactionV2
    txns = (
        db.query(BT)
        .filter(BT.account_id == account_id, BT.date >= start_date, BT.date <= end_date)
        .order_by(BT.date.asc(), BT.id.asc())
        .all()
    )
    groups = {}
    for t in txns:
        ref = (getattr(t, "reference", None) or "").strip()
        narr = (getattr(t, "narration", None) or getattr(t, "description", None) or "").strip()
        amt = float(getattr(t, "amount", 0) or 0)
        key = (
            f"{t.date}|ref:{ref.lower()}|amt:{amt:.2f}" if ref else f"{t.date}|nar:{narr.lower()}|amt:{amt:.2f}"
        )
        groups.setdefault(key, []).append(t)
    dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
    return dup_groups


def cleanup_duplicates(db: Session, account_id: int, start_date: date, end_date: date, dry_run: bool):
    dup_groups = scan_duplicates(db, account_id, start_date, end_date)
    rows_deleted = 0
    deleted_ids = []
    for key, items in dup_groups.items():
        keeper = items[0]
        to_delete = items[1:]
        for t in to_delete:
            deleted_ids.append(t.id)
            if not dry_run:
                db.delete(t)
                rows_deleted += 1
    if not dry_run:
        db.commit()
    return {
        "groups_processed": len(dup_groups),
        "rows_deleted": rows_deleted,
        "deleted_ids": deleted_ids,
    }


def main():
    parser = argparse.ArgumentParser(description="Scan and cleanup duplicate bank transactions")
    parser.add_argument("account", type=str, help="Chart of Accounts id or account_code (e.g., 1143)")
    parser.add_argument("start_date", type=str, help="Start date (YYYY-MM-DD or DD/MM/YYYY)")
    parser.add_argument("end_date", type=str, help="End date (YYYY-MM-DD or DD/MM/YYYY)")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, do not delete")
    args = parser.parse_args()

    sdate = parse_date(args.start_date)
    edate = parse_date(args.end_date)

    db = SessionLocal()
    try:
        # Accept either numeric id or account_code
        acc = None
        try:
            acc_id = int(args.account)
            acc = db.query(models.Account).filter(models.Account.id == acc_id).first()
        except ValueError:
            pass
        if acc is None:
            acc = db.query(models.Account).filter(models.Account.account_code == args.account).first()
        if not acc:
            print("Account not found")
            return

        result = cleanup_duplicates(db, acc.id, sdate, edate, dry_run=args.dry_run)
        print(
            f"Processed groups: {result['groups_processed']}, Rows deleted: {result['rows_deleted']}\nDeleted IDs: {result['deleted_ids']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
