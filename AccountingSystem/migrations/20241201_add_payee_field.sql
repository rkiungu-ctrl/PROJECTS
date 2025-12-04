-- Migration: Add payee field to bank_transactions table
-- Date: December 1, 2024
-- Purpose: Implement Manager.io style categorization with separate payee and Chart of Accounts

-- Add payee column to store WHO the transaction is with
ALTER TABLE bank_transactions 
ADD COLUMN payee VARCHAR(255) NULL;

-- Optional: Add index for better query performance on payee searches
CREATE INDEX idx_bank_transactions_payee ON bank_transactions(payee);

-- Update comments to clarify the distinction
COMMENT ON COLUMN bank_transactions.payee IS 'WHO: Person/company transacted with (e.g., ABC Plumbing Company)';
COMMENT ON COLUMN bank_transactions.counter_account_id IS 'WHAT: Chart of Accounts category (e.g., Repairs and Maintenance)';