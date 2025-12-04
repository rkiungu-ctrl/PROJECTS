# routes/account.py

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Dict, Any
import csv
import io
from datetime import datetime

from database import get_db
from models import Account
from models.bank_transaction_v2 import BankTransactionV2
from schemas.account import AccountCreate, AccountOut, AccountUpdate

router = APIRouter(
    prefix="/accounts",
    tags=["Chart of Accounts"]
)

# ----------------------- helpers -----------------------

def _get_parent_by_hint(db: Session, parent_account_code: Optional[str], parent_account_id: Optional[int]) -> Optional[Account]:
    """Resolve parent using either code or id (code wins if both provided)."""
    if parent_account_code:
        parent = db.query(Account).filter(Account.account_code == parent_account_code).first()
        if not parent:
            raise HTTPException(status_code=400, detail=f"Parent account_code '{parent_account_code}' not found")
        return parent
    if parent_account_id:
        parent = db.query(Account).filter(Account.id == parent_account_id).first()
        if not parent:
            raise HTTPException(status_code=400, detail=f"Parent account_id '{parent_account_id}' not found")
        return parent
    return None


def _to_out(a: Account) -> Dict[str, Any]:
    """Lightweight serializer to include parent code and avoid recursion by default."""
    return {
        "id": a.id,
        "account_code": a.account_code,
        "name": a.name,
        "type": a.type,
        
        "description": a.description,
        "is_active": a.is_active,
        "is_control_account": a.is_control_account,
        "is_physical": a.is_physical,
        "parent_account_code": a.parent.account_code if getattr(a, "parent", None) else None,
    }


def _build_tree(accounts: List[Account]) -> List[Dict[str, Any]]:
    """Return a nested tree (parent -> children) using in-memory assembly."""
    by_id = {a.id: a for a in accounts}
    children_map = {a.id: [] for a in accounts}
    roots = []

    for a in accounts:
        if a.parent_account_id and a.parent_account_id in by_id:
            children_map[a.parent_account_id].append(a)
        else:
            roots.append(a)

    def node(a: Account) -> Dict[str, Any]:
        return {
            **_to_out(a),
            "children": [node(c) for c in children_map[a.id]]
        }

    return [node(r) for r in roots]


# ----------------------------- CREATE -----------------------------
@router.post("/", response_model=AccountOut)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    if db.query(Account).filter_by(account_code=payload.account_code).first():
        raise HTTPException(status_code=400, detail="Account code already exists")

    parent = None
    if getattr(payload, "parent_account_code", None):
        parent = db.query(Account).filter(Account.account_code == payload.parent_account_code).first()
        if not parent:
            raise HTTPException(status_code=400, detail=f"Parent '{payload.parent_account_code}' not found")

    acc = Account(
        account_code=payload.account_code,
        name=payload.name,
        type=payload.type,
        description=getattr(payload, "description", None),
        is_active=getattr(payload, "is_active", True),
        is_control_account=getattr(payload, "is_control_account", False),
        is_physical=getattr(payload, "is_physical", False),
        parent_account_id=parent.id if parent else None,   # ✅ save the parent
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


# ------------------------------ LIST ------------------------------
@router.get("/", response_model=List[AccountOut])
def list_accounts(db: Session = Depends(get_db)):
    accounts = (
        db.query(Account)
        .options(joinedload(Account.parent))   # ✅ so .parent is available
        .order_by(Account.account_code)
        .all()
    )
    return accounts

# Alias to satisfy frontends expecting /accounts/accounts (do NOT add more duplicates)
@router.get("/accounts", response_model=List[AccountOut])
def list_accounts_alias(db: Session = Depends(get_db)):
    accounts = db.query(Account).order_by(Account.account_code).all()
    return accounts


# ------------------------- TREE (NESTED) --------------------------
@router.get("/tree", response_model=List[AccountOut])
def get_accounts_tree(db: Session = Depends(get_db)):
    accounts = (
        db.query(Account)
        .order_by(Account.type, Account.account_code)
        .all()
    )
    return _build_tree(accounts)


# --------------------------- GET BY CODE --------------------------
@router.get("/code/{account_code}", response_model=AccountOut)
def get_account_by_code(account_code: str, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.account_code == account_code).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


# ---------------------------- GET BY ID ---------------------------
@router.get("/{account_id}", response_model=AccountOut)
def get_account_by_id(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter_by(id=account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


# ----------------------------- SEARCH -----------------------------
@router.get("/search/")
def search_accounts(query: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    q = f"%{query}%"
    results = (
        db.query(Account)
        .filter(
            (Account.name.ilike(q)) |
            (Account.account_code.ilike(q))
        )
        .order_by(Account.account_code)
        .limit(25)
        .all()
    )
    # keep the lean payload your UI already expects
    return [{"account_code": a.account_code, "name": a.name} for a in results]

# Alias without trailing slash and supporting 'q' param (used by Journal form)
@router.get("/search")
def search_accounts_alias(
    q: Optional[str] = Query(None, min_length=1, description="Search text used by journal dropdown"),
    query: Optional[str] = Query(None, min_length=1, description="Legacy param name"),
    db: Session = Depends(get_db),
):
    term = (q or query)
    if not term:
        raise HTTPException(status_code=422, detail="Missing search term 'q' or 'query'")
    like = f"%{term}%"
    results = (
        db.query(Account)
        .filter((Account.name.ilike(like)) | (Account.account_code.ilike(like)))
        .order_by(Account.account_code)
        .limit(25)
        .all()
    )
    return [{"account_code": a.account_code, "name": a.name} for a in results]


# ---------------------------- UPDATE (ID) -------------------------
@router.put("/{account_id}", response_model=AccountOut)
def update_account_by_id(account_id: int, payload: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # handle parent change if provided
    parent = _get_parent_by_hint(db, getattr(payload, "parent_account_code", None), getattr(payload, "parent_account_id", None))
    update_data = payload.dict(exclude_unset=True)
    update_data.pop("parent_account_code", None)
    update_data.pop("parent_account_id", None)

    for field, value in update_data.items():
        setattr(account, field, value)

    account.parent_account_id = parent.id if parent else None

    db.commit()
    db.refresh(account)
    return account


# ------------------------- UPDATE (BY CODE) -----------------------
@router.put("/code/{account_code}", response_model=AccountOut)
def update_account_by_code(account_code: str, payload: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.account_code == account_code).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Resolve parent if provided
    parent = None
    if payload.parent_account_code is not None:
        if payload.parent_account_code == "" or payload.parent_account_code is None:
            account.parent_account_id = None
        else:
            parent = db.query(Account).filter(Account.account_code == payload.parent_account_code).first()
            if not parent:
                raise HTTPException(status_code=400, detail=f"Parent '{payload.parent_account_code}' not found")
            account.parent_account_id = parent.id

    # Apply other fields
    data = payload.dict(exclude_unset=True)
    data.pop("parent_account_code", None)
    data.pop("parent_account_id", None)
    for k, v in data.items():
        setattr(account, k, v)

    db.commit()
    db.refresh(account)
    return account


# ----------------------------- PATCH (ID) -------------------------
@router.patch("/{account_id}", response_model=AccountOut)
def patch_account(account_id: int, account_update: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    parent = _get_parent_by_hint(db, getattr(account_update, "parent_account_code", None), getattr(account_update, "parent_account_id", None))
    update_data = account_update.dict(exclude_unset=True)
    update_data.pop("parent_account_code", None)
    update_data.pop("parent_account_id", None)

    for key, value in update_data.items():
        setattr(account, key, value)

    if parent is not None:
        account.parent_account_id = parent.id

    db.commit()
    db.refresh(account)
    return account


# ----------------------------- DELETE -----------------------------
@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Prevent deleting control accounts or parents with children
    if account.is_control_account:
        raise HTTPException(status_code=400, detail="Cannot delete a control account")
    has_children = db.query(Account).filter(Account.parent_account_id == account.id).first() is not None
    if has_children:
        raise HTTPException(status_code=400, detail="Cannot delete an account that has child accounts")

    db.delete(account)
    db.commit()
    return {"message": "Account deleted"}


# ----------------------------- IMPORT ACCOUNTS (CSV) --------------
# Columns supported (case-insensitive):
# account_code, name, type, description, is_active, is_control_account, is_physical, parent_account_code
@router.post("/import/")
async def import_accounts(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    decoded = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))
    imported = 0
    errors = []

    required_cols = {"account_code", "name", "type"}
    if not reader.fieldnames:
        return {"imported": 0, "errors": ["Empty or invalid CSV."]}

    header_norm = [c.strip() for c in reader.fieldnames]
    missing_required = required_cols - set(header_norm)
    if missing_required:
        return {
            "imported": imported,
            "errors": [f"Missing required columns: {', '.join(sorted(missing_required))}"]
        }

    for row in reader:
        try:
            code = (row.get("account_code") or "").strip()
            if not code:
                errors.append("Row missing account_code")
                continue

            # Skip if exists
            if db.query(Account).filter(Account.account_code == code).first():
                errors.append(f"Account code {code} already exists.")
                continue

            parent_code = (row.get("parent_account_code") or "").strip() or None
            parent = None
            if parent_code:
                parent = db.query(Account).filter(Account.account_code == parent_code).first()
                if not parent:
                    errors.append(f"Parent account_code '{parent_code}' not found (for {code}).")
                    continue

            new_account = Account(
                account_code=code,
                name=(row.get("name") or "").strip(),
                type=(row.get("type") or "").strip(),
                description=(row.get("description") or "").strip() or None,
                is_active=((row.get("is_active") or "true").strip().lower() == "true"),
                is_control_account=((row.get("is_control_account") or "false").strip().lower() == "true"),
                is_physical=((row.get("is_physical") or "false").strip().lower() == "true"),
                parent_account_id=parent.id if parent else None
            )
            db.add(new_account)
            imported += 1

        except Exception as e:
            errors.append(f"Code {row.get('account_code')}: {str(e)}")

    db.commit()
    return {"imported": imported, "errors": errors}


# ------------------------ IMPORT BANK TRANSACTIONS ----------------
# Kept separate to avoid clashing with /accounts/import above.
@router.post("/bank-transactions/import/")
async def import_bank_transactions(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    decoded = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))
    imported = 0
    errors = []
    for row in reader:
        try:
            # Parse date using standardized function
            from utils.date_parser import validate_import_date
            try:
                parsed_date = validate_import_date(row["Date"], f"Transaction row")
            except ValueError as e:
                errors.append(str(e))
                continue
                
            tx = BankTransaction(
                date=parsed_date,
                description=row["Description"],
                amount=float(row["Amount"]),
                account_id=int(row["Account ID"]),
            )
            db.add(tx)
            imported += 1
        except Exception as e:
            errors.append(str(e))
    db.commit()
    return {"imported": imported, "errors": errors}


# ------------------------------ PING ------------------------------
@router.get("/ping")
def ping():
    return {"status": "ok"}


# --------------------------- KRA SEEDER ---------------------------
# Inserts a minimal KRA-aligned skeleton you can customize later.
# Safe to call multiple times; skips existing account_codes.
@router.post("/seed/kra")
def seed_kra(db: Session = Depends(get_db)):
    # Minimal starter sets; expand to your full KRA preset as needed.
    # Codes are examples; feel free to align with your final numbering convention.
    seed = [
        # ASSETS
        {"account_code": "1000", "name": "Assets", "type": "Asset", "is_control_account": True},
        {"account_code": "1100", "name": "Current Assets", "type": "Asset", "parent_account_code": "1000", "is_control_account": True},
        {"account_code": "1110", "name": "Cash and Cash Equivalents", "type": "Asset", "parent_account_code": "1100", "is_control_account": True},
        {"account_code": "1111", "name": "Petty Cash", "type": "Asset", "parent_account_code": "1110"},
        {"account_code": "1112", "name": "Bank - Main", "type": "Asset", "parent_account_code": "1110"},
        {"account_code": "1200", "name": "Receivables", "type": "Asset", "parent_account_code": "1100", "is_control_account": True},
        {"account_code": "1210", "name": "Trade Receivables", "type": "Asset", "parent_account_code": "1200"},
        {"account_code": "1220", "name": "Withholding VAT (Recoverable)", "type": "Asset", "parent_account_code": "1100"},

        # EQUITY & LIABILITIES
        {"account_code": "2000", "name": "Equity & Liabilities", "type": "Liability", "is_control_account": True},
        {"account_code": "2100", "name": "Current Liabilities", "type": "Liability", "parent_account_code": "2000", "is_control_account": True},
        {"account_code": "2110", "name": "Trade Payables", "type": "Liability", "parent_account_code": "2100"},
        {"account_code": "2120", "name": "VAT Payable", "type": "Liability", "parent_account_code": "2100"},
        {"account_code": "2125", "name": "Excise Duty Payable", "type": "Liability", "parent_account_code": "2100"},
        {"account_code": "2130", "name": "PAYE Payable", "type": "Liability", "parent_account_code": "2100"},
        {"account_code": "2135", "name": "NSSF Payable", "type": "Liability", "parent_account_code": "2100"},
        {"account_code": "2140", "name": "SHIF/NHIF Payable", "type": "Liability", "parent_account_code": "2100"},
        {"account_code": "2150", "name": "AHL Payable", "type": "Liability", "parent_account_code": "2100"},

        # INCOME
        {"account_code": "3000", "name": "Income", "type": "Income", "is_control_account": True},
        {"account_code": "3100", "name": "Operating Income", "type": "Income", "parent_account_code": "3000", "is_control_account": True},
        {"account_code": "3110", "name": "Internet Service Revenue", "type": "Income", "parent_account_code": "3100"},
        {"account_code": "3120", "name": "Installation Fees", "type": "Income", "parent_account_code": "3100"},

        # EXPENSES
        {"account_code": "4000", "name": "Expenses", "type": "Expense", "is_control_account": True},
        {"account_code": "4100", "name": "Operating Expenses", "type": "Expense", "parent_account_code": "4000", "is_control_account": True},
        {"account_code": "4110", "name": "Employment Expenses", "type": "Expense", "parent_account_code": "4100"},
        {"account_code": "4111", "name": "Salaries and Wages", "type": "Expense", "parent_account_code": "4110"},
        {"account_code": "4112", "name": "Employer NSSF", "type": "Expense", "parent_account_code": "4110"},
        {"account_code": "4113", "name": "Employer SHIF/NHIF", "type": "Expense", "parent_account_code": "4110"},
        {"account_code": "4114", "name": "Employer AHL", "type": "Expense", "parent_account_code": "4110"},
        {"account_code": "4120", "name": "Network Expenses (Cables, Icolo, Seacom)", "type": "Expense", "parent_account_code": "4100"},
        {"account_code": "4130", "name": "Utilities", "type": "Expense", "parent_account_code": "4100"},
        {"account_code": "4140", "name": "Rent", "type": "Expense", "parent_account_code": "4100"},
        {"account_code": "4150", "name": "Depreciation", "type": "Expense", "parent_account_code": "4100"},
    ]

    created = 0
    skipped = 0
    for row in seed:
        exists = db.query(Account).filter(Account.account_code == row["account_code"]).first()
        if exists:
            skipped += 1
            continue

        parent = None
        if "parent_account_code" in row and row["parent_account_code"]:
            parent = db.query(Account).filter(Account.account_code == row["parent_account_code"]).first()

        acc = Account(
            account_code=row["account_code"],
            name=row["name"],
            type=row["type"],
            description=row.get("description"),
            is_active=True,
            is_control_account=row.get("is_control_account", False),
            is_physical=row.get("is_physical", False),
            parent_account_id=parent.id if parent else None
        )
        db.add(acc)
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped}
