import sqlite3
from pprint import pprint
DB = r"c:\PROJECTS\AccountingSystem\accounting_system.db"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

staff_no = 'TNL009'
periods = ['2025-07', '2025-08']

print('Fixing loan statuses where balance_outstanding > 0...')
cur.execute("UPDATE loan_advances SET status = 'Active' WHERE COALESCE(balance_outstanding,0) > 0")
conn.commit()
print('Done.')

# find employee id
r = cur.execute("SELECT id FROM employees WHERE staff_no = ?", (staff_no,)).fetchone()
if not r:
    print('Employee not found')
    conn.close()
    raise SystemExit(1)
emp_id = r['id']

# get loans for employee
loans = cur.execute("SELECT * FROM loan_advances WHERE employee_id = ?", (emp_id,)).fetchall()
if not loans:
    print('No loans for employee')
else:
    print('Loans:')
    for l in loans:
        pprint(dict(l))

# For each payroll for staff in the requested periods, apply advance amount to the oldest due loan(s)
payrolls = cur.execute("SELECT * FROM payrolls p JOIN employees e ON e.id = p.employee_id WHERE e.staff_no = ? AND strftime('%Y-%m', p.period) IN (?, ?) ORDER BY p.period", (staff_no, periods[0], periods[1])).fetchall()
if not payrolls:
    print('No payrolls found for periods')
else:
    print('Found payrolls:')
    for p in payrolls:
        pprint(dict(p))

# helper: get due loans ordered by next_due_date asc or id
def get_due_loans():
    return cur.execute("SELECT * FROM loan_advances WHERE employee_id = ? AND COALESCE(balance_outstanding,0) > 0 AND COALESCE(deduction_method,'') = 'Payroll Deduction' ORDER BY COALESCE(next_due_date, '1900-01-01'), id", (emp_id,)).fetchall()

for p in payrolls:
    advance_amt = float(p['advance'] or 0)
    if advance_amt <= 0:
        continue
    remaining = advance_amt
    print(f"Applying advance {advance_amt} for payroll id {p['id']} period {p['period']}")
    due_loans = get_due_loans()
    for loan in due_loans:
        if remaining <= 0:
            break
        loan_id = loan['id']
        bal = float(loan['balance_outstanding'] or 0)
        pay = min(bal, remaining)
        if pay <= 0:
            continue
        # update loan
        new_repaid = float((loan['amount_repaid'] or 0)) + pay
        new_bal = max(bal - pay, 0)
        cur.execute("UPDATE loan_advances SET amount_repaid = ?, balance_outstanding = ?, last_deduction_date = ?, payslip_number = ? , status = ? WHERE id = ?", (new_repaid, new_bal, p['period'], f"PAY-{p['id']}", 'Cleared' if new_bal<=0 else 'Active', loan_id))
        # create repayment row if not exists for this loan+period
        rp = cur.execute("SELECT id FROM loan_repayments WHERE loan_id = ? AND period_ym = ?", (loan_id, p['period'][:7])).fetchone()
        if rp:
            cur.execute("UPDATE loan_repayments SET amount = COALESCE(amount,0) + ?, paid = 1, paid_on = ?, payslip_id = ? WHERE id = ?", (pay, p['period'], p['id'], rp['id']))
        else:
            cur.execute("INSERT INTO loan_repayments (loan_id, reference_no, period_ym, amount, paid, paid_on, payslip_id, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now'))", (loan_id, loan['reference_no'], p['period'][:7], pay, p['period'], p['id']))
        conn.commit()
        remaining -= pay
        print(f"  Applied {pay} to loan {loan['reference_no']} (new balance {new_bal})")

print('\nFinal loans:')
for l in cur.execute("SELECT * FROM loan_advances WHERE employee_id = ?", (emp_id,)):
    pprint(dict(l))

print('\nLoan repayments rows:')
for r in cur.execute("SELECT lr.*, la.reference_no FROM loan_repayments lr JOIN loan_advances la ON la.id = lr.loan_id WHERE la.employee_id = ? ORDER BY lr.period_ym", (emp_id,)):
    pprint(dict(r))

conn.close()
