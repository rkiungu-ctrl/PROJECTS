from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base

class BankRule(Base):
    __tablename__ = "bank_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)  # Rule name e.g. "FUEL Payments"
    description = Column(Text, nullable=True)   # Optional description
    
    # Matching conditions (ALL must match for rule to apply)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)  # Specific account or NULL for any
    transaction_type = Column(String(50), nullable=True)  # 'deposit', 'withdrawal', or NULL for any
    amount_min = Column(Float, nullable=True)   # Minimum amount or NULL for no limit
    amount_max = Column(Float, nullable=True)   # Maximum amount or NULL for no limit
    reference_contains = Column(String(255), nullable=True)  # Reference must contain this text
    narration_contains = Column(String(255), nullable=True)  # Narration must contain this text
    description_contains = Column(String(255), nullable=True)  # Description must contain this text
    payee_contains = Column(String(255), nullable=True)  # Payee must contain this text
    
    # Actions (what to do when rule matches)
    target_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)  # Account to categorize to
    payee_name = Column(String(255), nullable=True)  # Optional payee name to assign
    # Phase 2: Payee linkage + behaviour flags
    payee_type = Column(String(50), nullable=True)  # 'customer' | 'supplier' | 'employee' | 'other'
    payee_id = Column(Integer, nullable=True)       # stores id of the selected payee per type
    auto_create_payment_receipt = Column(Boolean, default=True)
    
    # Rule management
    is_active = Column(Boolean, default=True)   # Enable/disable rule
    priority = Column(Integer, default=100)     # Lower number = higher priority
    auto_apply = Column(Boolean, default=True)  # Auto-apply to new transactions
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100), nullable=True)  # Username who created rule
    
    # Relationships
    source_account = relationship("Account", foreign_keys=[account_id])
    target_account = relationship("Account", foreign_keys=[target_account_id])
    
    def __repr__(self):
        return f"<BankRule(id={self.id}, name='{self.name}', active={self.is_active})>"
    
    def matches_transaction(self, transaction):
        """
        Check if this rule matches a given bank transaction
        Returns True if ALL conditions match
        """
        # Account filter
        if self.account_id and transaction.account_id != self.account_id:
            return False
            
        # Transaction type filter
        if self.transaction_type and getattr(transaction, "transaction_type", None) != self.transaction_type:
            return False
            
        # Amount range filters
        if self.amount_min is not None and transaction.amount < self.amount_min:
            return False
        if self.amount_max is not None and transaction.amount > self.amount_max:
            return False
            
        # Reference text filter
        if self.reference_contains:
            if not transaction.reference or self.reference_contains.lower() not in transaction.reference.lower():
                return False
                
        # Narration text filter  
        if self.narration_contains:
            if not transaction.narration or self.narration_contains.lower() not in transaction.narration.lower():
                return False

        # Description text filter
        if self.description_contains:
            desc = getattr(transaction, "description", None) or getattr(transaction, "narration", None) or ""
            if self.description_contains.lower() not in desc.lower():
                return False

        # Payee text filter
        if self.payee_contains:
            payee = getattr(transaction, "payee", None) or getattr(transaction, "payee_name", None) or ""
            if self.payee_contains.lower() not in payee.lower():
                return False
        
        return True
        
    def apply_to_transaction(self, transaction):
        """
        Apply this rule's actions to a transaction
        Returns dict of changes made
        """
        changes = {}
        
        # Set counter account (this categorizes the transaction)
        if transaction.counter_account_id != self.target_account_id:
            changes['counter_account_id'] = self.target_account_id
            transaction.counter_account_id = self.target_account_id
            
        # Set payee if specified and missing
        current_payee = getattr(transaction, 'payee', None) or getattr(transaction, 'payee_name', None)
        if self.payee_name and not (current_payee and str(current_payee).strip()):
            changes['payee'] = self.payee_name
            if hasattr(transaction, 'payee'):
                transaction.payee = self.payee_name
            elif hasattr(transaction, 'payee_name'):
                transaction.payee_name = self.payee_name
            
        return changes