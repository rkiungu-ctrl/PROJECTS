"""Utilities to map legacy loan/advance rows into the canonical loan_advances schema.

This module is defensive: it does not perform DB writes. It only provides
helpers used by the migration script to normalise/canonicalise rows.
"""
from datetime import datetime


def map_employee_loans_row_to_loan_advances(row: dict) -> dict:
    """Map a row from `employee_loans` to the canonical `loan_advances` fields.

    `row` is a plain dict (as returned by sqlite3.Row or SQLAlchemy). The
    function returns a dict suitable for insertion into loan_advances.
    """
    out = {}
    # Basic mappings — be conservative and coerce types
    out['loan_type'] = row.get('type') or row.get('loan_type') or row.get('loan_category') or 'Loan'
    out['reference_no'] = row.get('reference_no') or row.get('reference') or row.get('ref')
    # Dates: try several candidate columns
    date_str = row.get('date_issued') or row.get('start_date') or row.get('issued')
    if date_str:
        try:
            out['date_issued'] = datetime.fromisoformat(str(date_str)).date()
        except Exception:
            try:
                out['date_issued'] = datetime.strptime(str(date_str), '%Y-%m-%d').date()
            except Exception:
                out['date_issued'] = None
    else:
        out['date_issued'] = None

    # Numeric fields
    def _num(k):
        v = row.get(k)
        try:
            return float(v) if v is not None and v != '' else 0.0
        except Exception:
            return 0.0

    out['principal_amount'] = _num('principal') or _num('principal_amount')
    out['interest_rate'] = _num('interest_rate') or 0.0
    out['repayment_period'] = int(row.get('repayment_period') or row.get('repayment') or 0 or 0)
    out['installment_amount'] = _num('installment_amount') or _num('installment') or 0.0
    out['deduction_method'] = row.get('deduction_method') or row.get('method') or 'Payroll Deduction'

    # Balance/repaid semantics: be defensive about column names
    out['balance_outstanding'] = _num('balance') or _num('balance_outstanding')
    out['amount_repaid'] = _num('amount_repaid') or _num('repaid') or 0.0

    out['status'] = row.get('status') or ('Cleared' if out['balance_outstanding'] <= 0 else 'Active')

    # employee id should be preserved by migration caller
    return out


def map_employee_advances_row_to_loan_advances(row: dict) -> dict:
    """Map an `employee_advances` row into canonical loan_advances shape.

    Advances may be represented as separate table historically. We map them
    into loan_advances with loan_type='Advance'.
    """
    out = map_employee_loans_row_to_loan_advances(row)
    out['loan_type'] = 'Advance'
    # employee_advances may use 'amount' as principal
    if not out.get('principal_amount') or out.get('principal_amount') == 0.0:
        out['principal_amount'] = float(row.get('amount') or 0.0)
    # ensure installment exists
    if not out.get('installment_amount'):
        out['installment_amount'] = float(row.get('amount') or 0.0)
    return out
