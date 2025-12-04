#!/usr/bin/env python3
from database import SessionLocal
from sqlalchemy import text
from models.payroll import Payroll as PayrollModel
from routes.payroll import calculate_nhif_or_shif

s = SessionLocal()
try:
    print('--- SHIF settings rows ---')
    rows = s.execute(text('SELECT id, rate, cap, start_date, end_date FROM shif_settings ORDER BY start_date')).fetchall()
    if not rows:
        print('No shif_settings rows')
    else:
        for r in rows:
            print({k: r._mapping[k] for k in r._mapping.keys()})

    print('\n--- Payroll id=35 ---')
    p = s.query(PayrollModel).filter(PayrollModel.id == 35).first()
    if not p:
        print('Payroll id=35 not found')
    else:
        print('payroll.id=', p.id)
        print('employee staff_no=', p.employee.staff_no if hasattr(p, 'employee') and p.employee else None)
        print('period (repr)=', repr(p.period), 'type=', type(p.period))
        print('gross_pay=', p.gross_pay, 'stored_shif=', p.shif)
        calc = calculate_nhif_or_shif(s, float(p.gross_pay or 0.0), p.period)
        print('calculated_shif=', calc)
finally:
    s.close()
