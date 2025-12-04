import sqlite3
p=r'c:\\PROJECTS\\AccountingSystem\\accounting_system.db'
con=sqlite3.connect(p)
cur=con.cursor()
for row in cur.execute("SELECT id, reference_no, loan_type, principal_amount, date_issued FROM loan_advances WHERE employee_id=1 ORDER BY id"):
    print(row)
con.close()
