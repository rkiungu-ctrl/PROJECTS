#!/usr/bin/env python3
from database import SessionLocal
from sqlalchemy import text

session = SessionLocal()
try:
    # Raw SQL to avoid model name mismatches
    res = session.execute(text('SELECT id, rate, cap, start_date, end_date FROM shif_settings')).fetchall()
    if not res:
        print('No rows in shif_settings')
    else:
        print('shif_settings rows:')
        for r in res:
            # Row is a SQLAlchemy Row; use _mapping to access as dict
            try:
                print(dict(r._mapping))
            except Exception:
                print(tuple(r))
finally:
    session.close()
