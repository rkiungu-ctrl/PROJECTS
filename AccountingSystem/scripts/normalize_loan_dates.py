"""
Normalize empty-string date fields in loan_advances to NULL.
This script is safe to run multiple times (idempotent).
It updates these columns to NULL where they equal the empty string:
 - date_issued
 - next_due_date
 - last_deduction_date

Run locally with PYTHONPATH set to AccountingSystem if you want to use SQLAlchemy,
but this script uses sqlite3 directly so it doesn't depend on the app runtime.
"""

# REMOVED: temporary migration script
# This file was a one-off helper to normalize loan date fields and has been
# removed as part of repository cleanup. If you need the original script, it
# can be restored from version control or recreated from the commit history.

raise SystemExit("normalize_loan_dates.py removed: temporary migration scripts have been cleaned up.")
