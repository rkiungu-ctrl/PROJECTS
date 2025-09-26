# utils/fx.py
# -----------------------------------------------------------------------------
# Central FX helpers for your FastAPI + SQLAlchemy app.
# Store both transaction currency amounts (*_txn) and base currency amounts (*_base).
# Use these helpers in routes: invoice, purchase, receipts/payments, bank transactions.
# -----------------------------------------------------------------------------

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import date, datetime
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session


# ---------- Internal helpers --------------------------------------------------

def _to_decimal(value) -> Decimal:
    """Safely convert common numeric types/strings to Decimal."""
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=422, detail=f"Invalid decimal value: {value!r}")


def _quant(decimals: int) -> Decimal:
    """Return
