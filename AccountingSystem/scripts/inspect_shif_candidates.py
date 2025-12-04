#!/usr/bin/env python3
from database import SessionLocal
from models.payroll import Payroll as PayrollModel
from routes.payroll import calculate_nhif_or_shif, _resolve_shif_model, _active_row_by_period

session = SessionLocal()
rows = session.query(PayrollModel).filter((PayrollModel.shif == 0) | (PayrollModel.shif == None)).order_by(PayrollModel.period.asc()).all()
print(f"Found {len(rows)} candidate rows")
for p in rows:
    gross = float(getattr(p, 'gross_pay', 0.0) or 0.0)
    period = getattr(p, 'period', None)
    old_shif = float(getattr(p, 'shif', 0.0) or 0.0)
    calc = calculate_nhif_or_shif(session, gross, period)
    ShifModel = _resolve_shif_model()
    setting = _active_row_by_period(session, ShifModel, period)
    print(f"id={p.id} staff={getattr(p.employee,'staff_no',None)} period={period} gross={gross} old_shif={old_shif} calc_shif={calc} setting_id={getattr(setting,'id',None) if setting else None}")
session.close()
