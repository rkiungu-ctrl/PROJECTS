-- Phase 2: Enhanced Bank Rules with Payee Linking and Auto-Create flags

-- Bank Rules: add payee_type, payee_id, auto_create_payment_receipt
ALTER TABLE bank_rules ADD COLUMN IF NOT EXISTS payee_type VARCHAR(50);
ALTER TABLE bank_rules ADD COLUMN IF NOT EXISTS payee_id INTEGER;
ALTER TABLE bank_rules ADD COLUMN IF NOT EXISTS auto_create_payment_receipt BOOLEAN DEFAULT TRUE;

-- Bank Transactions v2: add is_categorized + structured payee fields
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS is_categorized BOOLEAN DEFAULT FALSE;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS payee_type VARCHAR(50);
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS payee_id INTEGER;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS payee_name VARCHAR(255);
