import sqlite3
DB = r"c:\PROJECTS\AccountingSystem\accounting_system.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()
print('SHIF settings:')
for row in cur.execute('SELECT id, rate, cap, start_date, end_date FROM shif_settings ORDER BY start_date'):
    print(row)

print('\nNHIF bands (sample):')
for row in cur.execute('SELECT id, lower_limit, upper_limit, deduction, start_date, end_date FROM nhif_band ORDER BY start_date'):
    print(row)

print('\nPayroll settings rows (payroll_settings table):')
try:
    for row in cur.execute('SELECT id, name, value FROM payroll_settings'):
        print(row)
except Exception as e:
    print('payroll_settings table not present or different schema:', e)

conn.close()
