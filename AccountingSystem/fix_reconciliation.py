from sqlalchemy import create_engine, text

# This must match your DB path
engine = create_engine("sqlite:///./accounting_system.db")

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE bank_transactions ADD COLUMN is_reconciled BOOLEAN DEFAULT 0"))

print("✅ Reconciliation column added.")
