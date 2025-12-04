#!/usr/bin/env python3
"""
Check the data corruption after schema migration
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

def check_data_corruption():
    """Check what happened to the data during migration"""
    
    print("🔍 Checking data corruption after migration...")
    
    with engine.connect() as conn:
        
        # 1. Check current corrupted data
        print("1️⃣ Current corrupted data:")
        result = conn.execute(text("""
            SELECT id, purchase_invoice_id, type, item, account_code, description, quantity, unit_price 
            FROM purchase_invoice_lines 
            WHERE purchase_invoice_id IN (214, 215, 216, 217, 218)
            ORDER BY id DESC LIMIT 10
        """))
        
        for row in result:
            print(f"   Line {row[0]}: invoice_id={row[1]}, type={row[2]}, item='{row[3]}', account='{row[4]}'")
            print(f"             description='{row[5]}', qty={row[6]}, price={row[7]}")
        
        # 2. Check if backup exists with original data
        print(f"\n2️⃣ Checking for backup data:")
        try:
            result = conn.execute(text("SELECT COUNT(*) FROM purchase_invoice_lines_backup"))
            backup_count = result.fetchone()[0]
            print(f"   Backup rows available: {backup_count}")
            
            if backup_count > 0:
                print("   Sample backup data:")
                result = conn.execute(text("""
                    SELECT id, purchase_invoice_id, type, item, account_code, description
                    FROM purchase_invoice_lines_backup 
                    WHERE purchase_invoice_id IN (214, 215, 216, 217, 218)
                    AND id IS NOT NULL
                    LIMIT 5
                """))
                
                for row in result:
                    print(f"     Backup Line {row[0]}: type={row[2]}, item='{row[3]}', account='{row[4]}'")
                    
        except Exception as e:
            print(f"   ❌ No backup table: {e}")
        
        # 3. Check older good data for comparison
        print(f"\n3️⃣ Good data for comparison:")
        result = conn.execute(text("""
            SELECT id, purchase_invoice_id, type, item, account_code, description, quantity, unit_price
            FROM purchase_invoice_lines 
            WHERE id BETWEEN 600 AND 610
            LIMIT 5
        """))
        
        for row in result:
            print(f"   Good Line {row[0]}: type={row[2]}, item='{row[3]}', account='{row[4]}'")
            print(f"               description='{row[5]}', qty={row[6]}, price={row[7]}")

if __name__ == "__main__":
    check_data_corruption()