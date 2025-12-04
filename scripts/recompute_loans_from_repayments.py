import sqlite3
from datetime import datetime

db = r'C:\PROJECTS\AccountingSystem\accounting_system.db'
conn = sqlite3.connect(db)
cur = conn.cursor()

# Optionally accept staff_no from env or hardcode
import sys
staff = sys.argv[1] if len(sys.argv) > 1 else None

if staff:
    cur.execute('SELECT id,staff_no,name FROM employees WHERE staff_no=?', (staff,))
    emp = cur.fetchone()
    if not emp:
        print('Employee not found', staff)
        sys.exit(1)
    emp_id = emp[0]
    cur.execute('SELECT id,reference_no,principal_amount FROM loan_advances WHERE employee_id=?', (emp_id,))
else:
    cur.execute('SELECT id,reference_no,principal_amount FROM loan_advances')

loans = cur.fetchall()
print('Found loans:', len(loans))
for loan in loans:
    lid, ref, principal = loan
    cur.execute('SELECT COALESCE(SUM(amount),0) FROM loan_repayments WHERE loan_id=? AND paid=1', (lid,))
    total_paid = cur.fetchone()[0] or 0.0
    try:
        principal_f = float(principal or 0.0)
    except Exception:
        principal_f = 0.0
    bal = max(principal_f - float(total_paid or 0.0), 0.0)
    status = 'Cleared' if bal <= 0.0001 else 'Active'
    # Clear next_due_date if cleared
    if status == 'Cleared':
        cur.execute('UPDATE loan_advances SET amount_repaid=?, balance_outstanding=?, status=?, next_due_date=NULL WHERE id=?', (round(total_paid,2), round(bal,2), status, lid))
    else:
        cur.execute('UPDATE loan_advances SET amount_repaid=?, balance_outstanding=?, status=? WHERE id=?', (round(total_paid,2), round(bal,2), status, lid))
    print(f'Loan {ref} ({lid}): paid={total_paid} principal={principal_f} bal={bal} -> status={status}')

conn.commit()
conn.close()
print('Done')
