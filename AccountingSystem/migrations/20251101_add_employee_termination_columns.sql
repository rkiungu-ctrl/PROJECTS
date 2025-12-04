-- Add termination and audit columns to employees table
ALTER TABLE employees ADD COLUMN status TEXT;
ALTER TABLE employees ADD COLUMN termination_date DATE;
ALTER TABLE employees ADD COLUMN termination_reason TEXT;
ALTER TABLE employees ADD COLUMN pro_rate_basic INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN accumulated_leave_payout REAL DEFAULT 0.0;
ALTER TABLE employees ADD COLUMN terminated_by TEXT;
ALTER TABLE employees ADD COLUMN terminated_at DATETIME;
