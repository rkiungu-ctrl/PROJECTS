#!/usr/bin/env python3
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%purchase%'"))
    tables = [row[0] for row in result.fetchall()]
    print("Purchase-related tables:", tables)
    
    # Check schema for each table
    for table in tables:
        print(f"\n--- {table} ---")
        result = conn.execute(text(f"PRAGMA table_info({table})"))
        columns = result.fetchall()
        for col in columns:
            print(f"  {col[1]} {col[2]} (primary={col[5]}, not_null={col[3]}, default={col[4]})")