#!/usr/bin/env python3
"""
Restore correct data from backup and fix the column mapping
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

def restore_correct_data():
    """Restore the correct data mapping"""
    
    with engine.connect() as conn:
        
        # Check backup
        print("🔍 Checking backup data...")
        result = conn.execute(text("SELECT * FROM purchase_invoice_lines_backup WHERE purchase_invoice_id = 214 LIMIT 1"))
        sample = result.fetchone()
        if sample:
            print(f"Sample backup row: {dict(sample._mapping)}")
        
        # Clear corrupted data and restore from backup
        print("\n🔧 Restoring correct data...")
        
        # Delete corrupted records for invoice 214
        conn.execute(text("DELETE FROM purchase_invoice_lines WHERE purchase_invoice_id = 214"))
        
        # Restore from backup with proper column mapping
        conn.execute(text("""
            INSERT INTO purchase_invoice_lines 
            (purchase_invoice_id, product_id, type, item, account_code, description, quantity, unit_price, vat_code, excise_code)
            SELECT 
                purchase_invoice_id, 
                product_id, 
                type, 
                item, 
                account_code, 
                description, 
                COALESCE(quantity, 0.0),
                COALESCE(unit_price, 0.0),
                vat_code, 
                excise_code
            FROM purchase_invoice_lines_backup 
            WHERE purchase_invoice_id = 214
        """))
        
        conn.commit()
        
        # Verify restoration
        result = conn.execute(text("""
            SELECT id, type, item, quantity, unit_price, account_code 
            FROM purchase_invoice_lines 
            WHERE purchase_invoice_id = 214
        """))
        
        print("✅ Restored data:")
        for row in result:
            print(f"  ID={row[0]}, type={row[1]}, item={row[2][:50]}..., qty={row[3]}, price={row[4]}")
        
        print("🎉 Data restoration complete!")

if __name__ == "__main__":
    restore_correct_data()