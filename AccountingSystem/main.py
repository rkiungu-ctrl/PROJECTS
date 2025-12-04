# main.py
from dotenv import load_dotenv
import os

# Load environment variables from .env file FIRST
load_dotenv()

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text
import time

from database import engine, Base, get_db
import models  # ensure SQLAlchemy models are registered

# Optional: if models/company.py exists, make sure it's imported so the table is created
try:
    from models.company import CompanyProfile  # noqa: F401
except Exception:
    pass

# --------- App ---------
from fastapi import FastAPI
app = FastAPI(title="Accounting System API")

# --------- Routers ---------
from routes import (
    customer,
    employee,
    payroll,
    journal,
    account,
    stock_entry,
    invoice,
    supplier,
    purchase,
    bank_rules,         # Bank Rules CRUD + management
    cash_flow,
    user,
    reports,
    tax,
    customer_import,
    product,
    import_invoices,
    company,            # company settings/profile
    activity,
    increment,
    bank_v2,
)
from routes.employee_import import router as employee_import_router
from routes import currency as currency_routes
from routes.nhif_band import router as nhif_band_router
# ✅ Payroll settings (generic + NSSF periodized endpoints)
from routes.payroll_settings import router as payroll_settings_router
from routes.payslip import router as payslip_router
from routes import reports
# ✅ Ensure NSSFSetting model is registered before create_all
import models.nssf_setting  # <-- important so nssf_settings table is created
# Ensure AHL model is registered so ahl_tables is created
import models.ahl  # noqa: F401
# Ensure loan_repayment model is registered so the repayments table is created
import models.loan_repayment  # noqa: F401
# Ensure our new non-cash benefit model is registered
import models.non_cash_benefit  # noqa: F401

# Serve static files with CORS headers
if os.path.isdir("static"):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from fastapi import Request
    
    class CORSStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):
            response = await super().get_response(path, scope)
            if hasattr(response, 'headers'):
                response.headers["Access-Control-Allow-Origin"] = "*"
                response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
                response.headers["Access-Control-Allow-Headers"] = "*"
            return response
    
    app.mount("/static", CORSStaticFiles(directory="static"), name="static")

# --------- CORS ---------

# Only allow the frontend origin for CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple request timing (helps trace slow routes)
@app.middleware("http")
async def timing(request: Request, call_next):
    start = time.time()
    try:
        response = await call_next(request)
        return response
    finally:
        dur_ms = (time.time() - start) * 1000
        print(f"{request.method} {request.url.path} took {dur_ms:.1f}ms")

# Health checks
@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/db-ping")
def db_ping(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"db": "ok"}

# Create tables (all models must be imported above this line)
Base.metadata.create_all(bind=engine)
try:
    # Prefer the definitive DATABASE_URL/DB_PATH from the shared database module
    from database import DATABASE_URL, DB_PATH
    print(f"Using DB at: {DATABASE_URL} (file: {DB_PATH})")
except Exception:
    # Fall back to the previous hard-coded message if import fails for any reason
    print("Using DB at: sqlite:///./accounting_system.db")

# --------- Include routers (each exactly once) ---------
app.include_router(customer.router)
app.include_router(employee.router)
app.include_router(payroll.router)
app.include_router(journal.router)
app.include_router(account.router)
app.include_router(stock_entry.router)
app.include_router(invoice.router)
app.include_router(supplier.router)
app.include_router(purchase.router)
# Manager.io style payments and receipts (now the main modules)
# Note: Fresh implementations are now the main payment and receipt modules
app.include_router(bank_rules.router)
app.include_router(cash_flow.router)
app.include_router(user.router)
app.include_router(reports.router)
app.include_router(tax.router)
app.include_router(customer_import.router)
app.include_router(product.router)
app.include_router(import_invoices.router)
app.include_router(employee_import_router, prefix="/employee_import")
app.include_router(company.router)
app.include_router(activity.router)
app.include_router(currency_routes.router)
app.include_router(nhif_band_router)
app.include_router(payslip_router)
app.include_router(reports.router)
app.include_router(increment.router)
# Employee loans repayment router
from routes.employee_loans import router as employee_loans_router
app.include_router(employee_loans_router)
# Non-cash benefit router (manage pending one-off benefits)
from routes.non_cash_benefit import router as non_cash_benefit_router
app.include_router(non_cash_benefit_router)
# ✅ Mount payroll settings (includes /payroll-settings and /payroll-settings/nssf)
app.include_router(payroll_settings_router)
from routes.payroll_settings import shif as shif_router
app.include_router(shif_router)
app.include_router(bank_v2.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
