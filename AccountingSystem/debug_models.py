#!/usr/bin/env python3
"""
Debug model imports to see which PurchaseInvoice is being used
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Test the imports used in routes/purchase.py
from models.purchase_invoice import PurchaseInvoice as NewPurchaseInvoice, PurchaseInvoiceLine as NewPurchaseInvoiceLine
import models

print("🔍 Checking model imports...")
print(f"NewPurchaseInvoice from models.purchase_invoice: {NewPurchaseInvoice}")
print(f"NewPurchaseInvoice.__tablename__: {NewPurchaseInvoice.__tablename__}")

print(f"\nmodels.PurchaseInvoice: {models.PurchaseInvoice}")
print(f"models.PurchaseInvoice.__tablename__: {models.PurchaseInvoice.__tablename__}")

print(f"\nAre they the same class? {NewPurchaseInvoice is models.PurchaseInvoice}")

# Check the relationships
print(f"\nNewPurchaseInvoice.lines relationship: {NewPurchaseInvoice.lines}")
print(f"models.PurchaseInvoice.lines relationship: {models.PurchaseInvoice.lines}")

# Check line model table names
print(f"\nNewPurchaseInvoiceLine.__tablename__: {NewPurchaseInvoiceLine.__tablename__}")
print(f"models.PurchaseInvoiceLine.__tablename__: {models.PurchaseInvoiceLine.__tablename__}")

# Test creating instances
print(f"\n🧪 Testing model creation:")
try:
    new_invoice = NewPurchaseInvoice()
    print(f"✅ NewPurchaseInvoice created: {new_invoice}")
    print(f"   Lines attribute: {hasattr(new_invoice, 'lines')}")
except Exception as e:
    print(f"❌ NewPurchaseInvoice error: {e}")

try:
    models_invoice = models.PurchaseInvoice()
    print(f"✅ models.PurchaseInvoice created: {models_invoice}")
    print(f"   Lines attribute: {hasattr(models_invoice, 'lines')}")
except Exception as e:
    print(f"❌ models.PurchaseInvoice error: {e}")