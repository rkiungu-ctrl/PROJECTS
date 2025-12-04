-- Add nullable end_date column to increments table
ALTER TABLE increments
ADD COLUMN end_date DATE NULL;

-- Backfill: for each employee, set end_date of an increment to (next.start_date - 1 day)
-- This is a generic SQL that should work on SQLite/Postgres/MySQL with minor edits.
-- For SQLite (no interval), we can use DATE(next.start_date, '-1 day')

-- Example for SQLite/Postgres compatibility using DATE arithmetic where supported:
-- The following is written for SQLite. If you use Postgres, use "next.start_date - INTERVAL '1 day'" instead.

WITH ordered AS (
  SELECT
    id,
    employee_id,
    start_date,
    LEAD(start_date) OVER (PARTITION BY employee_id ORDER BY start_date) AS next_start
  FROM increments
)
UPDATE increments
SET end_date = DATE(ordered.next_start, '-1 day')
FROM ordered
WHERE increments.id = ordered.id
  AND ordered.next_start IS NOT NULL
  AND increments.end_date IS NULL;

-- Note: If your DB does not support UPDATE ... FROM with CTEs (e.g., older SQLite),
-- run a small script (provided in scripts/backfill_increments_end_date.py) that performs the same logic.
