# --- Payment schemas for Banking v2 ---

from decimal import Decimal
from typing import List, Optional
from datetime import date

from pydantic import BaseModel, ConfigDict


# ---------- LINE INPUT (for create & update) ----------

class BankPaymentLineCreate(BaseModel):
    """
    Line item for creating / updating a bank payment.
    """
    account_code: str
    amount: Decimal
    # Per-line VAT code, e.g. "VAT16" or None
    vat_code: Optional[str] = None
    # Per-line description (for purchase invoice line)
    description: Optional[str] = None


# ---------- PAYMENT CREATE PAYLOAD (legacy / general) ----------

class BankPaymentCreate(BaseModel):
    """
    Original create schema (still kept for compatibility).
    The new v2 create endpoint actually uses BankPaymentUpdate, but
    having this here doesn't hurt and may be used elsewhere.
    """
    date: date
    reference: Optional[str] = None
    bank_account_code: str
    payee: Optional[str] = None
    description: Optional[str] = None
    currency: str = "Ksh"
    payment_type: str = "normal"

    # Structured payee fields
    payee_type: Optional[str] = None   # "supplier", "customer", "other"
    payee_id: Optional[int] = None
    payee_name: Optional[str] = None

    # ETR details (for ETR Purchase)
    etr_supplier_name: Optional[str] = None
    etr_supplier_pin: Optional[str] = None
    etr_number: Optional[str] = None
    etr_date: Optional[date] = None
    etr_vat_code: Optional[str] = None

    lines: List[BankPaymentLineCreate]


# ---------- PAYMENT UPDATE PAYLOAD (used for both CREATE & UPDATE in v2) ----------

class BankPaymentUpdate(BaseModel):
    """
    Payload used by:
      - POST /bank-accounts/payments/  (create)
      - PUT  /bank-accounts/payments/{id}  (update)
    """
    # Common header fields
    date: date
    reference: Optional[str] = None
    payee: Optional[str] = None
    description: Optional[str] = None
    currency: str = "Ksh"
    payment_type: str = "normal"

    # Structured payee fields used by bank_v2.py
    payee_type: Optional[str] = None   # "supplier", "customer", "other"
    payee_id: Optional[int] = None
    payee_name: Optional[str] = None

    # ETR details for ETR Purchase payments
    etr_supplier_name: Optional[str] = None
    etr_supplier_pin: Optional[str] = None
    etr_number: Optional[str] = None
    etr_date: Optional[date] = None
    etr_vat_code: Optional[str] = None

    # Line items (with per-line VAT)
    lines: List[BankPaymentLineCreate]

    # Used only on CREATE; ignored on UPDATE
    bank_account_code: Optional[str] = None


# ---------- LINE RESPONSE MODEL ----------

class BankPaymentLine(BaseModel):
    """
    Line representation when returning a payment.
    """
    id: int
    account_id: int
    account_code: str
    account_name: str
    amount: Decimal

    model_config = ConfigDict(from_attributes=True)


# ---------- PAYMENT RESPONSE MODEL ----------

class BankPaymentResponse(BaseModel):
    """
    Unified response used by:
      - GET /bank-accounts/withdrawals/
      - GET /bank-accounts/payments/{id}
      - POST /bank-accounts/payments/
      - PUT  /bank-accounts/payments/{id}
    """
    id: int
    date: date
    reference: Optional[str] = None

    bank_account_id: int                # tx.account_id
    bank_account_name: str              # human readable
    bank_account_code: Optional[str] = None  # may be omitted in list endpoints

    description: Optional[str] = None
    payee: Optional[str] = None
    currency: str = "Ksh"
    payment_type: str = "normal"

    # ETR-related info (optional)
    etr_supplier_name: Optional[str] = None
    etr_supplier_pin: Optional[str] = None
    etr_number: Optional[str] = None
    etr_date: Optional[date] = None
    etr_vat_code: Optional[str] = None
    purchase_invoice_id: Optional[int] = None

    # Total amount of the payment
    total_amount: Decimal

    # Line items (optional)
    lines: List[BankPaymentLine] = []

    model_config = ConfigDict(from_attributes=True)


# ---------- BANK ACCOUNT SUMMARY (dashboard / balances) ----------

class BankAccountSummary(BaseModel):
    id: int
    account_code: str
    name: str
    # Allow dynamic assignment from currency module
    currency_code: Optional[str] = None
    uncategorized_receipts: int = 0
    uncategorized_payments: int = 0
    cleared_balance: float = 0.0
    actual_balance: float = 0.0

    model_config = ConfigDict(from_attributes=True)
