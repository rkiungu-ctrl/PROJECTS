-- Migration: add paid, paid_on, payslip_id to loan_repayments
-- Add new nullable columns so older rows remain compatible

PRAGMA foreign_keys=off;
BEGIN TRANSACTION;

ALTER TABLE loan_repayments ADD COLUMN paid BOOLEAN DEFAULT 0;
ALTER TABLE loan_repayments ADD COLUMN paid_on DATE;
ALTER TABLE loan_repayments ADD COLUMN payslip_id INTEGER;

COMMIT;
PRAGMA foreign_keys=on;
