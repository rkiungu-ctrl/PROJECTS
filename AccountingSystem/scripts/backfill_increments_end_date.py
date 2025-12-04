"""
Backfill script to compute end_date for increments based on the next record's start_date.
Run with your project's Python environment: python backfill_increments_end_date.py
This script uses SQLAlchemy session via your project's get_db helper; adjust DB connection as needed.
"""
from datetime import timedelta
from database import SessionLocal
import models

def main():
    db = SessionLocal()
    try:
        employees = db.query(models.Employee).all()
        for emp in employees:
            incs = db.query(models.Increment).filter(models.Increment.employee_id == emp.id).order_by(models.Increment.start_date.asc()).all()
            for i in range(len(incs) - 1):
                curr = incs[i]
                nxt = incs[i+1]
                desired_end = nxt.start_date - timedelta(days=1)
                if curr.end_date != desired_end:
                    curr.end_date = desired_end
                    db.add(curr)
            db.commit()
        print("Backfill complete")
    finally:
        db.close()

if __name__ == '__main__':
    main()
