-- Migration: Add bank_rules table for auto-categorization
-- Date: 2025-11-17
-- Description: Creates bank_rules table to enable pattern-based transaction categorization

CREATE TABLE IF NOT EXISTS bank_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Matching conditions (ALL must match for rule to apply)
    account_id INTEGER,  -- Specific account or NULL for any
    transaction_type VARCHAR(50),  -- 'deposit', 'withdrawal', or NULL for any
    amount_min REAL,  -- Minimum amount or NULL for no limit
    amount_max REAL,  -- Maximum amount or NULL for no limit
    reference_contains VARCHAR(255),  -- Reference must contain this text
    narration_contains VARCHAR(255),  -- Narration must contain this text
    
    -- Actions (what to do when rule matches)
    target_account_id INTEGER NOT NULL,  -- Account to categorize to
    payee_name VARCHAR(255),  -- Optional payee name to assign
    
    -- Rule management
    is_active BOOLEAN DEFAULT 1,  -- Enable/disable rule
    priority INTEGER DEFAULT 100,  -- Lower number = higher priority
    auto_apply BOOLEAN DEFAULT 1,  -- Auto-apply to new transactions
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),  -- Username who created rule
    
    -- Foreign key constraints
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (target_account_id) REFERENCES accounts(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bank_rules_active ON bank_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_bank_rules_priority ON bank_rules(priority);
CREATE INDEX IF NOT EXISTS idx_bank_rules_account ON bank_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_rules_target ON bank_rules(target_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_rules_type ON bank_rules(transaction_type);

-- Add updated_at trigger
CREATE TRIGGER IF NOT EXISTS bank_rules_updated_at 
    AFTER UPDATE ON bank_rules
BEGIN
    UPDATE bank_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;