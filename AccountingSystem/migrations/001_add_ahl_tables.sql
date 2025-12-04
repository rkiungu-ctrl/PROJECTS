-- 001_add_ahl_tables.sql
CREATE TABLE IF NOT EXISTS ahl_tables (
  id INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT,
  employee_rate REAL NOT NULL,
  employer_rate REAL NOT NULL,
  relief_rate REAL,
  relief_cap_month INTEGER
);

-- Seed rows (Kenya)
INSERT INTO ahl_tables (start_date,end_date,employee_rate,employer_rate,relief_rate,relief_cap_month)
SELECT '2023-07-01','2024-03-18',0.015,0.015,NULL,NULL
WHERE NOT EXISTS(SELECT 1 FROM ahl_tables WHERE start_date='2023-07-01' AND end_date='2024-03-18');

INSERT INTO ahl_tables (start_date,end_date,employee_rate,employer_rate,relief_rate,relief_cap_month)
SELECT '2024-03-19',NULL,0.015,0.015,0.15,9000
WHERE NOT EXISTS(SELECT 1 FROM ahl_tables WHERE start_date='2024-03-19' AND end_date IS NULL);
