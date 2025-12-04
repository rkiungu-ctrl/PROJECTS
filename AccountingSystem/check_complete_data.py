#!/usr/bin/env python3
"""
Check header and line field mapping for the Fargo Courier invoice
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

def check_complete_invoice_data():
    """Check both header and line data for the Fargo Courier invoice"""
    
    print("🔍 Checking COMPLETE invoice data (header + lines)...")
    
    with engine.connect() as conn:
        
        # 1. Check header fields for Fargo Courier invoice (reference 91562888)
        print("1️⃣ HEADER FIELDS:")
        result = conn.execute(text("""
            SELECT id, supplier_id, invoice_date, reference, cu_inv_number, currency_code, exchange_rate, status
            FROM purchase_invoices 
            WHERE reference = '91562888'
        """))
        
        invoice_data = None
        for row in result:
            invoice_data = row
            print(f"   Invoice ID: {row[0]}")
            print(f"   Supplier ID: {row[1]} (should map to 'Fargo Courier Ltd')")
            print(f"   Date: {row[2]} (should be '30/09/2025')")
            print(f"   Reference: {row[3]} (should be '91562888')")
            print(f"   CU INV Number: {row[4]} (should be '019099493000038926S')")
            print(f"   Currency: {row[5]} (should be 'KES')")
            print(f"   Exchange Rate: {row[6]}")
            print(f"   Status: {row[7]}")
        
        if not invoice_data:
            print("   ❌ Invoice not found!")
            return
        
        # 2. Check supplier name resolution
        print(f"\n2️⃣ SUPPLIER RESOLUTION:")
        result = conn.execute(text(f"""
            SELECT name FROM suppliers WHERE id = {invoice_data[1]}
        """))
        supplier_row = result.fetchone()
        if supplier_row:
            print(f"   Supplier Name: '{supplier_row[0]}' (should be 'Fargo Courier Ltd')")
        else:
            print(f"   ❌ Supplier ID {invoice_data[1]} not found!")
        
        # 3. Check line items for this invoice
        print(f"\n3️⃣ LINE ITEMS:")
        result = conn.execute(text(f"""
            SELECT id, type, item, description, account_code, quantity, unit_price, vat_code, excise_code
            FROM purchase_invoice_lines 
            WHERE purchase_invoice_id = {invoice_data[0]}
            ORDER BY id
        """))
        
        lines = list(result)
        print(f"   Found {len(lines)} lines:")
        
        for i, line in enumerate(lines):
            print(f"   Line {i+1}:")
            print(f"     ID: {line[0]}")
            print(f"     Type: '{line[1]}' (should be 'Product' or 'Service')")
            print(f"     Item: '{line[2]}' (should be service description)")
            print(f"     Description: '{line[3]}'")
            print(f"     Account: '{line[4]}' (should be account code, NOT unit price!)")
            print(f"     Quantity: {line[5]} (should be 1.0)")
            print(f"     Unit Price: {line[6]} (should be 30794.7)")
            print(f"     VAT Code: '{line[7]}' (should be '2252')")
            print(f"     Excise Code: '{line[8]}'")
            print()
        
        # 4. Check what the GET endpoint actually returns
        print(f"4️⃣ TESTING GET ENDPOINT SIMULATION:")
        print("   This simulates what the frontend receives...")
        
        header_response = {
            "id": invoice_data[0],
            "supplier_id": invoice_data[1],
            "invoice_date": str(invoice_data[2]),
            "reference": invoice_data[3],
            "cu_inv_number": invoice_data[4],
            "currency_code": invoice_data[5],
            "status": invoice_data[7]
        }
        
        lines_response = []
        for line in lines:
            lines_response.append({
                "id": line[0],
                "type": line[1],
                "item": line[2],
                "description": line[3],
                "account_code": line[4],
                "quantity": line[5],
                "unit_price": line[6],
                "vat_code": line[7],
                "excise_code": line[8]
            })
        
        print(f"   Header Response: {header_response}")
        print(f"   Lines Response: {lines_response}")

if __name__ == "__main__":
    check_complete_invoice_data()