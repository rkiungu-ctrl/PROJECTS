from database import SessionLocal
import models

db = SessionLocal()

accounts = db.query(models.Account).all()

print("---- Account Categories ----")
for acc in accounts:
    print(f"{acc.account_code} - {acc.name} - category: {acc.category}")
