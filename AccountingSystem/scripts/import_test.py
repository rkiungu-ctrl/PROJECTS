import importlib, sys
sys.path.insert(0, r'C:\PROJECTS\AccountingSystem')
try:
    importlib.invalidate_caches()
    import routes.employee_loans as m
    print('IMPORT_OK')
except Exception:
    import traceback
    traceback.print_exc()
