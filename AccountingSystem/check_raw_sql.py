#!/usr/bin/env python3
"""
Check database with raw SQL
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine
from sqlalchemy import text

def check_with_sql():
    """Check using raw SQL"""
    
    try:
        with engine.connect() as conn:
            # Check recent invoices
            result = conn.execute(text("SELECT id, reference, supplier_id FROM purchase_invoices ORDER BY id DESC LIMIT 3"))
            print("Recent invoices:")
            for row in result:
                print(f"  Invoice ID={row[0]}, reference={row[1]}, supplier_id={row[2]}")
            
            print()
            
            # Check recent line items
            result = conn.execute(text("SELECT id, purchase_invoice_id, type, item, description, quantity, unit_price FROM purchase_invoice_lines ORDER BY id DESC LIMIT 5"))
            print("Recent line items:")
            for row in result:
                print(f"  Line ID={row[0]}, invoice_id={row[1]}, type={row[2]}, item={row[3]}, qty={row[5]}, price={row[6]}")
                
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_with_sql()