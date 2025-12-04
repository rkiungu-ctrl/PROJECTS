#!/usr/bin/env python3
"""
Analyze the NULL ID rows before fixing schema
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

def analyze_null_id_rows():
    """Analyze what's in the NULL ID rows"""
    
    print("🔍 Analyzing NULL ID rows...")
    
    with engine.connect() as conn:
        
        # Get NULL ID rows
        result = conn.execute(text("""
            SELECT purchase_invoice_id, type, item, quantity, unit_price, account_code
            FROM purchase_invoice_lines 
            WHERE id IS NULL
            ORDER BY purchase_invoice_id
        """))
        
        null_rows = list(result)
        print(f"Found {len(null_rows)} rows with NULL IDs:")
        
        # Group by invoice
        invoices = {}
        for row in null_rows:
            invoice_id = row[0]
            if invoice_id not in invoices:
                invoices[invoice_id] = []
            invoices[invoice_id].append(row)
        
        for invoice_id, lines in invoices.items():
            print(f"\n📋 Invoice {invoice_id}: {len(lines)} NULL ID lines")
            for i, line in enumerate(lines):
                item = line[2][:50] if line[2] else 'None'
                print(f"  {i+1}. {line[1]} - {item} (qty: {line[3]}, price: {line[4]})")
        
        # Check if these invoices have any valid lines too
        print(f"\n🔍 Checking if these invoices have valid lines...")
        for invoice_id in invoices.keys():
            result = conn.execute(text(f"""
                SELECT COUNT(*) as valid_lines
                FROM purchase_invoice_lines 
                WHERE purchase_invoice_id = {invoice_id} AND id IS NOT NULL
            """))
            valid_count = result.fetchone()[0]
            total_null = len(invoices[invoice_id])
            print(f"  Invoice {invoice_id}: {valid_count} valid lines, {total_null} NULL ID lines")

def fix_with_data_preservation():
    """Fix schema while preserving NULL ID data by assigning new IDs"""
    
    print(f"\n🔧 SAFER APPROACH: Preserve data with new IDs")
    
    with engine.connect() as conn:
        
        # 1. Get the current maximum ID
        result = conn.execute(text("SELECT MAX(id) FROM purchase_invoice_lines WHERE id IS NOT NULL"))
        max_id = result.fetchone()[0] or 0
        print(f"Current max ID: {max_id}")
        
        # 2. Update NULL IDs with sequential new IDs
        print(f"Assigning new IDs to NULL records...")
        
        # Get all NULL ID rows
        result = conn.execute(text("""
            SELECT rowid, purchase_invoice_id, type, item 
            FROM purchase_invoice_lines 
            WHERE id IS NULL
            ORDER BY rowid
        """))
        null_rows = list(result)
        
        # Assign new IDs
        new_id = max_id + 1
        for row in null_rows:
            rowid = row[0]
            conn.execute(text(f"UPDATE purchase_invoice_lines SET id = {new_id} WHERE rowid = {rowid}"))
            print(f"  Assigned ID {new_id} to row {rowid} (invoice {row[1]})")
            new_id += 1
        
        conn.commit()
        print(f"✅ Assigned IDs {max_id + 1} to {new_id - 1}")
        
        # 3. Now add proper constraints
        print(f"\nAdding constraints to existing table...")
        
        # Check current schema
        result = conn.execute(text("PRAGMA table_info(purchase_invoice_lines)"))
        current_schema = list(result)
        
        # We need to recreate with constraints since SQLite doesn't support ADD CONSTRAINT for primary keys
        print(f"Creating new table with constraints...")
        
        conn.execute(text("""
            CREATE TABLE purchase_invoice_lines_fixed (
                id INTEGER PRIMARY KEY,
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
        
        # Copy all data
        result = conn.execute(text("""
            INSERT INTO purchase_invoice_lines_fixed 
            SELECT * FROM purchase_invoice_lines
        """))
        copied_rows = result.rowcount
        
        # Replace table
        conn.execute(text("DROP TABLE purchase_invoice_lines"))
        conn.execute(text("ALTER TABLE purchase_invoice_lines_fixed RENAME TO purchase_invoice_lines"))
        conn.commit()
        
        print(f"✅ Schema fixed! All {copied_rows} rows preserved.")
        
        # Verify
        result = conn.execute(text("SELECT COUNT(*) FROM purchase_invoice_lines WHERE id IS NULL"))
        null_count = result.fetchone()[0]
        print(f"✅ Verification: {null_count} NULL IDs remaining (should be 0)")
        
        return True

if __name__ == "__main__":
    analyze_null_id_rows()
    
    response = input("\nFix schema while preserving all data? (y/N): ")
    if response.lower() == 'y':
        fix_with_data_preservation()