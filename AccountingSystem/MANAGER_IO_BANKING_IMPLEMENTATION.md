#!/usr/bin/env python3
"""
MANAGER.IO BANKING IMPLEMENTATION SUMMARY
===========================================

This document explains how the banking module now correctly implements Manager.io behavior.

## CORE PRINCIPLE: ONE BANKING ENGINE, FILTERED VIEWS

### 1. Master Banking Table (BankTransaction)
- ALL bank/cash movements stored in one table
- Each transaction has:
  - original_amount: The SOURCE OF TRUTH from bank statement
  - type: "withdrawal" or "deposit" 
  - payee: WHO (person/company) - Primary business relationship
  - counter_account_id: WHAT (expense/income category) - Secondary classification
  - account_id: Which bank/cash account

### 2. Filtered Views
- **Bank Account Transactions**: Shows ALL transactions for an account
- **Payments**: Shows only withdrawals (type = "withdrawal")  
- **Receipts**: Shows only deposits (type = "deposit")

## EDIT BEHAVIOR - MANAGER.IO COMPLIANT

### 3. Unified Edit Form
**Same edit form used from any view:**
- Bank Account Transactions → Edit
- Payments List → Edit  
- Receipts List → Edit

**All use the same endpoints:**
- GET `/bank_transactions/transactions/{id}/edit` - Load existing data
- PUT `/bank_transactions/transactions/{id}` - Update transaction
- GET `/payments/{id}/edit` - Same format as bank transaction edit
- PUT `/payments/{id}` - Same update logic
- GET `/receipts/{id}/edit` - Same format as bank transaction edit  
- PUT `/receipts/{id}` - Same update logic

### 4. Data Preservation Rules

**NEVER auto-change existing data:**
- ✅ Load exactly what was saved before
- ✅ Preserve original bank amount unless user explicitly changes it
- ✅ Show existing payee, description, reference, split lines
- ❌ Never reset amounts or clear fields automatically

**Original Amount = Source of Truth:**
- The amount from the bank statement/original entry
- Split lines categorize this amount, don't replace it
- System can warn if split total ≠ original amount
- But original amount stays unless user explicitly changes it

### 5. Split Lines Implementation

**Current: Single Category**
- One transaction → one counter_account_id
- Split line shows: account_name + original_amount

**Future: Multi-Category Splits**
- One transaction → multiple split lines
- Each line: account_id + partial_amount  
- Sum of partial_amounts = original_amount
- Requires additional split_lines table

## FINAL CLEAN FILE STRUCTURE

### Main Banking Modules (Only these exist now)
- `routes/bank_transaction.py` - Main banking module with unified edit
- `routes/payment.py` - Manager.io style payments (was payments_fresh.py)  
- `routes/receipt.py` - Manager.io style receipts (was receipts_fresh.py)

### Files Removed (No more confusion!)
- ❌ `routes/bank_transactions_fresh.py` - Duplicate, removed
- ❌ `routes/bank_transaction_backup.py` - Backup, removed
- ❌ `routes/payment_old.py` - Old implementation, removed
- ❌ `routes/receipt_old.py` - Old implementation, removed

**Result: Clean, single-purpose banking modules with no duplicates!**

## API ENDPOINTS

### Bank Transactions
```
GET  /bank_transactions/accounts                     # List all bank accounts
GET  /bank_transactions/accounts/{id}/transactions   # Transactions for account
GET  /bank_transactions/transactions/{id}/edit      # Load for editing (unified format)
PUT  /bank_transactions/transactions/{id}           # Update (unified logic)
```

### Payments (Withdrawals)
```
GET  /payments/                                      # List all payments
GET  /payments/list                                  # Legacy frontend endpoint
GET  /payments/{id}/edit                            # Load payment for editing (same as bank transaction)
PUT  /payments/{id}                                 # Update payment (same logic)
POST /payments/                                     # Create new payment
```

### Receipts (Deposits)  
```
GET  /receipts/                                     # List all receipts
GET  /receipts/list                                 # Legacy frontend endpoint
GET  /receipts/{id}/edit                           # Load receipt for editing (same as bank transaction)
PUT  /receipts/{id}                                # Update receipt (same logic)
POST /receipts/                                    # Create new receipt
```

## EDIT FORM DATA FORMAT

**Load for Edit (GET /{id}/edit):**
```json
{
  "id": 123,
  "date": "2025-11-16",
  "type": "withdrawal",
  "original_amount": 410.0,           // SOURCE OF TRUTH - preserve this
  "reference": "TKG001234", 
  "description": "Car wash service - ABC Car Wash",
  "payee": "ABC Car Wash Services",   // WHO
  "payee_type": "Other",
  "bank_account_id": 1142,
  "bank_account_name": "Chatpesa Limited",
  "split_lines": [                    // HOW we categorize the amount
    {
      "account_id": 6630,
      "account_name": "Repairs and maintenance", 
      "amount": 400.0,
      "invoice_id": null
    },
    {
      "account_id": 5001,
      "account_name": "Bank Charges",
      "amount": 10.0, 
      "invoice_id": null
    }
  ],
  "split_total": 410.0               // Should = original_amount
}
```

**Update (PUT /{id}):**
```json
{
  "date": "2025-11-16",
  "payee": "ABC Car Wash Services",
  "description": "Car wash service - ABC Car Wash", 
  "reference": "TKG001234",
  "original_amount": 410.0,          // Only change if user explicitly modifies
  "split_lines": [
    {"account_id": 6630, "amount": 400.0},
    {"account_id": 5001, "amount": 10.0}
  ]
}
```

## FRONTEND REQUIREMENTS

**Edit Form Should:**
1. Load existing data exactly as saved (no auto-changes)
2. Show "Paid from" bank account (pre-selected, from transaction)
3. Show payee type dropdown + name field
4. Show full description from bank 
5. Show split lines with ability to add/remove
6. Show warning if split_total ≠ original_amount
7. Allow editing original_amount if needed
8. Use same form whether editing from Bank Transactions, Payments, or Receipts

**Button Behavior:**
- "Edit" from any list → Same unified edit form
- "Save" → Preserves original_amount unless user changed it
- "Cancel" → No changes saved

This matches Manager.io exactly: one banking engine, consistent edit experience, data preservation.
"""