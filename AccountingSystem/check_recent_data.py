#!/usr/bin/env python3
"""
Simple database query test
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import get_db, engine
from models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceLine

def check_recent_data():
    """Check the most recent purchase invoice data"""
    
    db = Session(engine)
    
    try:
        # Get the most recent invoice
        recent_invoice = db.query(PurchaseInvoice).order_by(PurchaseInvoice.id.desc()).first()
        if recent_invoice:
            print(f"Most recent invoice: ID={recent_invoice.id}, reference={recent_invoice.reference}")
            
            # Get its lines
            lines = db.query(PurchaseInvoiceLine).filter(
                PurchaseInvoiceLine.purchase_invoice_id == recent_invoice.id
            ).all()
            
            print(f"Lines for invoice {recent_invoice.id}: {len(lines)}")
            for line in lines:
                print(f"  Line: ID={line.id}, type={line.type}, item={line.item}")
        else:
            print("No invoices found")
            
        # Also check the raw lines table
        print("\nAll recent lines:")
        recent_lines = db.query(PurchaseInvoiceLine).order_by(PurchaseInvoiceLine.id.desc()).limit(5).all()
        for line in recent_lines:
            print(f"  Line ID={line.id}, invoice_id={line.purchase_invoice_id}, type={line.type}, item={line.item}")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_recent_data()