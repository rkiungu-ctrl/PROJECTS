#!/usr/bin/env python3
"""
EMERGENCY: Complete rollback and proper data migration
The previous migration scrambled all the data fields!
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

def emergency_rollback_and_fix():
    """Emergency rollback and proper migration"""
    
    print("🚨 EMERGENCY ROLLBACK AND DATA RECOVERY")
    print("=" * 60)
    print("The previous migration scrambled all field data!")
    print("This will restore from backup and redo the migration properly.")
    
    proceed = input("\nProceed with emergency recovery? (y/N): ")
    if proceed.lower() != 'y':
        print("Aborted.")
        return False
    
    with engine.connect() as conn:
        
        # 1. Drop the corrupted new table
        print("\n1️⃣ Dropping corrupted table...")
        conn.execute(text("DROP TABLE IF EXISTS purchase_invoice_lines"))
        conn.commit()
        print("   ✅ Corrupted table dropped")
        
        # 2. Check if backup exists
        print("\n2️⃣ Checking backup...")
        try:
            result = conn.execute(text("SELECT COUNT(*) FROM purchase_invoice_lines_backup"))
            backup_count = result.fetchone()[0]
            print(f"   Found backup with {backup_count} rows")
        except:
            print("   ❌ No backup found! Creating from scratch...")
            return create_fresh_table()
        
        # 3. Restore from backup  
        print("\n3️⃣ Restoring from backup...")
        conn.execute(text("""
            CREATE TABLE purchase_invoice_lines AS 
            SELECT * FROM purchase_invoice_lines_backup
        """))
        conn.commit()
        print("   ✅ Restored from backup")
        
        # 4. Now fix ONLY the ID column issue (preserve all other data)
        print("\n4️⃣ Fixing ONLY the ID column...")
        
        # Create temp table with proper ID column
        conn.execute(text("""
            CREATE TABLE temp_lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                purchase_invoice_id INTEGER NOT NULL,
                product_id INTEGER,
                description TEXT,
                quantity REAL,
                unit_price REAL,
                type TEXT,
                vat_code TEXT,
                excise_code TEXT,
                item TEXT,
                account_code TEXT
            )
        """))
        
        # Copy data preserving original column mapping
        conn.execute(text("""
            INSERT INTO temp_lines 
            (purchase_invoice_id, product_id, description, quantity, unit_price, type, vat_code, excise_code, item, account_code)
            SELECT 
                purchase_invoice_id, product_id, description, quantity, unit_price, type, vat_code, excise_code, item, account_code
            FROM purchase_invoice_lines 
            WHERE purchase_invoice_id IS NOT NULL
        """))
        
        # Replace table
        conn.execute(text("DROP TABLE purchase_invoice_lines"))
        conn.execute(text("ALTER TABLE temp_lines RENAME TO purchase_invoice_lines"))
        conn.commit()
        
        print("   ✅ ID column fixed while preserving data")
        
        # 5. Verify the fix
        print("\n5️⃣ Verifying recovery...")
        result = conn.execute(text("""
            SELECT id, purchase_invoice_id, type, item, account_code, quantity, unit_price 
            FROM purchase_invoice_lines 
            WHERE purchase_invoice_id IN (214, 215, 216, 217, 218)
            ORDER BY id DESC LIMIT 3
        """))
        
        print("   Sample recovered data:")
        for row in result:
            print(f"     ID={row[0]}, invoice_id={row[1]}, type='{row[2]}', item='{row[3]}'")
            print(f"     account='{row[4]}', qty={row[5]}, price={row[6]}")
        
        print(f"\n🎉 RECOVERY COMPLETE!")
        return True

def create_fresh_table():
    """Create fresh table if no backup available"""
    print("Creating fresh table structure...")
    
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE purchase_invoice_lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                purchase_invoice_id INTEGER NOT NULL,
                product_id INTEGER,
                type TEXT,
                item TEXT,
                account_code TEXT,
                description TEXT,
                quantity REAL DEFAULT 0.0,
                unit_price REAL DEFAULT 0.0,
                vat_code TEXT,
                excise_code TEXT,
                FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices (id) ON DELETE CASCADE
            )
        """))
        conn.commit()
        print("   ✅ Fresh table created")
        return True

if __name__ == "__main__":
    emergency_rollback_and_fix()