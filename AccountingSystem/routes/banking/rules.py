from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
import models
from models.bank_rule import BankRule

router = APIRouter(
    prefix="/bank-rules",
    tags=["Bank Rules"],
)


class BankRuleIn(BaseModel):
    name: str
    is_active: bool = True
    priority: Optional[int] = 100

    bank_account_id: Optional[int] = None
    transaction_type: Optional[str] = None  # "deposit" | "withdrawal" | None
    description_contains: Optional[str] = None
    reference_contains: Optional[str] = None
    payee_contains: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None

    target_account_id: int
    set_payee_to: Optional[str] = None
    # Phase 2
    payee_type: Optional[str] = Field(default=None, description="customer|supplier|employee|other")
    payee_id: Optional[int] = None
    auto_create_payment_receipt: Optional[bool] = True


class BankRuleOut(BaseModel):
    id: int
    name: str
    is_active: bool
    priority: Optional[int]
    bank_account_id: Optional[int]
    transaction_type: Optional[str]
    description_contains: Optional[str]
    reference_contains: Optional[str]
    payee_contains: Optional[str]
    min_amount: Optional[float]
    max_amount: Optional[float]
    target_account_id: int
    set_payee_to: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    # Phase 2
    payee_type: Optional[str]
    payee_id: Optional[int]
    auto_create_payment_receipt: Optional[bool]

    model_config = dict(from_attributes=True)


@router.get("/", response_model=List[BankRuleOut])
def list_bank_rules(
    is_active: Optional[bool] = Query(None),
    bank_account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(BankRule)
    if is_active is not None:
        q = q.filter(BankRule.is_active == is_active)
    if bank_account_id is not None:
        q = q.filter(BankRule.account_id == bank_account_id)
    rules = q.order_by(BankRule.priority.asc(), BankRule.id.asc()).all()
    return rules


@router.post("/", response_model=BankRuleOut)
def create_bank_rule(payload: BankRuleIn, db: Session = Depends(get_db)):
    # Validate target account exists
    target = db.query(models.Account).filter(models.Account.id == payload.target_account_id).first()
    if not target:
        raise HTTPException(status_code=400, detail="Target account not found")

    rule = BankRule(
        name=payload.name,
        is_active=payload.is_active,
        priority=payload.priority,
        account_id=payload.bank_account_id,
        transaction_type=payload.transaction_type,
        description_contains=payload.description_contains,
        reference_contains=payload.reference_contains,
        payee_contains=payload.payee_contains,
        amount_min=payload.min_amount,
        amount_max=payload.max_amount,
        target_account_id=payload.target_account_id,
        payee_name=payload.set_payee_to,
        payee_type=payload.payee_type,
        payee_id=payload.payee_id,
        auto_create_payment_receipt=payload.auto_create_payment_receipt,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/{rule_id}", response_model=BankRuleOut)
def update_bank_rule(
    rule_id: int = Path(...),
    payload: BankRuleIn = Body(...),
    db: Session = Depends(get_db),
):
    rule = db.query(BankRule).filter(BankRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Optional target account validation
    target = db.query(models.Account).filter(models.Account.id == payload.target_account_id).first()
    if not target:
        raise HTTPException(status_code=400, detail="Target account not found")

    rule.name = payload.name
    rule.is_active = payload.is_active
    rule.priority = payload.priority
    rule.account_id = payload.bank_account_id
    rule.transaction_type = payload.transaction_type
    rule.description_contains = payload.description_contains
    rule.reference_contains = payload.reference_contains
    rule.payee_contains = payload.payee_contains
    rule.amount_min = payload.min_amount
    rule.amount_max = payload.max_amount
    rule.target_account_id = payload.target_account_id
    rule.payee_name = payload.set_payee_to
    rule.payee_type = payload.payee_type
    rule.payee_id = payload.payee_id
    rule.auto_create_payment_receipt = payload.auto_create_payment_receipt

    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
def delete_bank_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(BankRule).filter(BankRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "ok", "deleted_id": rule_id}
