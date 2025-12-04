import sqlite3
from pprint import pprint
DB = r"c:\PROJECTS\AccountingSystem\accounting_system.db"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

staff_no = 'TNL009'
periods = ['2025-07', '2025-08']

print('\n=== Employees matching staff_no ===')
for row in cur.execute("SELECT id, staff_no, name FROM employees WHERE staff_no = ?", (staff_no,)):
    pprint(dict(row))

print('\n=== Loan Advances for staff ===')
for row in cur.execute("SELECT la.* FROM loan_advances la JOIN employees e ON e.id = la.employee_id WHERE e.staff_no = ?", (staff_no,)):
    pprint(dict(row))

print('\n=== Loan Repayments for staff periods ===')
for row in cur.execute("SELECT lr.*, e.staff_no as emp_staff_no FROM loan_repayments lr LEFT JOIN loan_advances la ON la.id = lr.loan_id LEFT JOIN employees e ON e.id = la.employee_id WHERE (e.staff_no = ? OR lr.reference_no LIKE ?) AND period_ym IN (?, ?) ORDER BY lr.period_ym", (staff_no, '%'+staff_no+'%', periods[0], periods[1])):
    pprint(dict(row))

print('\n=== Payrolls for staff and periods ===')
for row in cur.execute("SELECT p.*, e.staff_no FROM payrolls p JOIN employees e ON e.id = p.employee_id WHERE e.staff_no = ? AND strftime('%Y-%m', p.period) IN (?, ?)", (staff_no, periods[0], periods[1])):
    pprint(dict(row))

print('\n=== Any loan_repayments rows for those loans regardless of period ===')
for row in cur.execute("SELECT lr.*, la.reference_no, e.staff_no FROM loan_repayments lr JOIN loan_advances la ON la.id = lr.loan_id JOIN employees e ON e.id = la.employee_id WHERE e.staff_no = ?", (staff_no,)):
    pprint(dict(row))

conn.close()
