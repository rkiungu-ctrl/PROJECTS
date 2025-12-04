"""Safe serializers for LoanAdvance ORM objects.

These helpers return plain Python dicts with primitive types and avoid returning
SQLAlchemy ORM instances or objects that Pydantic cannot serialize.

Use these when attaching loans/advances to API payloads.
"""
from typing import Any, Dict


def _date_to_iso(v):
    if v is None:
        return None
    try:
        if hasattr(v, "isoformat"):
            return v.isoformat()
    except Exception:
        pass
    try:
        if isinstance(v, str):
            return v
    except Exception:
        pass
    return None


def serialize_loan(obj: Any) -> Dict[str, Any]:
    # Be defensive: individual field conversions shouldn't raise. Handle
    # date strings and date objects, and prefer returning sensible defaults.
    def _date_to_iso(v):
        if v is None:
            return None
        try:
            if hasattr(v, "isoformat"):
                return v.isoformat()
        except Exception:
            pass
        try:
            # if it's already a string like '2025-01-01'
            if isinstance(v, str):
                return v
        except Exception:
            pass
        return None

    out = {}
    try:
        out["id"] = getattr(obj, "id", None)
        out["employee_id"] = getattr(obj, "employee_id", None)
        out["loan_type"] = getattr(obj, "loan_type", getattr(obj, "type", None))
        out["reference_no"] = getattr(obj, "reference_no", None)
        try:
            out["principal_amount"] = float(getattr(obj, "principal_amount", getattr(obj, "principal", 0) or 0) or 0)
        except Exception:
            out["principal_amount"] = 0.0
        out["date_issued"] = _date_to_iso(getattr(obj, "date_issued", None))
        try:
            out["interest_rate"] = float(getattr(obj, "interest_rate", 0.0) or 0.0)
        except Exception:
            out["interest_rate"] = 0.0
        try:
            out["repayment_period"] = int(getattr(obj, "repayment_period", getattr(obj, "repayment", 0) or 0) or 0)
        except Exception:
            out["repayment_period"] = 0
        try:
            out["installment_amount"] = float(getattr(obj, "installment_amount", 0) or 0)
        except Exception:
            out["installment_amount"] = 0.0
        out["deduction_method"] = getattr(obj, "deduction_method", None)
        try:
            out["schedule"] = list(getattr(obj, "schedule", []) or [])
        except Exception:
            out["schedule"] = []
        try:
            out["balance_outstanding"] = float(getattr(obj, "balance_outstanding", getattr(obj, "balance", 0) or 0) or 0)
        except Exception:
            out["balance_outstanding"] = 0.0
        try:
            out["balance"] = float(getattr(obj, "balance_outstanding", getattr(obj, "balance", 0) or 0) or 0)
        except Exception:
            out["balance"] = out.get("balance_outstanding", 0.0)
        try:
            out["amount_repaid"] = float(getattr(obj, "amount_repaid", getattr(obj, "repaid", 0) or 0) or 0)
        except Exception:
            out["amount_repaid"] = 0.0
        out["status"] = getattr(obj, "status", None)
        out["remarks"] = getattr(obj, "remarks", None)
    except Exception:
        # very last-resort minimal payload
        try:
            return {"id": getattr(obj, "id", None), "reference_no": getattr(obj, "reference_no", None)}
        except Exception:
            return {}
    return out


def serialize_advance(obj: Any) -> Dict[str, Any]:
    try:
        return {
            "id": getattr(obj, "id", None),
            "amount": float(getattr(obj, "principal_amount", getattr(obj, "amount", 0) or 0) or 0),
            "balance": float(getattr(obj, "balance_outstanding", getattr(obj, "balance", 0) or 0) or 0),
            "issue_date": _date_to_iso(getattr(obj, "date_issued", None)),
            "recover_months": int(getattr(obj, "repayment_period", getattr(obj, "recover_months", 0) or 0) or 0),
            "note": getattr(obj, "remarks", getattr(obj, "note", None)),
        }
    except Exception:
        try:
            return {"id": getattr(obj, "id", None)}
        except Exception:
            return {}
