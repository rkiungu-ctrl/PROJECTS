# Copilot Instructions for AccountingSystem

## Project Overview
- **Domain:** Accounting and financial management system
- **Main App:** `AccountingSystem/` (Python backend, likely Flask or FastAPI)
- **Frontend:** Not directly present; may be integrated elsewhere or via templates/static
- **Data:** SQLite DBs (`accounting_system.db`, `accounting.db`, etc.)
- **Key Directories:**
  - `models/`: SQLAlchemy models for all business entities (accounts, invoices, payroll, etc.)
  - `routes/`: API endpoints, organized by resource (e.g., `invoice.py`, `customer.py`)
  - `schemas/`: Likely Pydantic schemas for request/response validation
  - `utils/`, `scripts/`: Utility and migration scripts
  - `pdfs/`, `static/`, `templates/`: Output, assets, and HTML templates

## Developer Workflows
- **Run the app:** Use `main.py` as the entry point
- **DB migrations:** Use scripts like `create_tables.py`, `update_db.py`, `reset_tables.py`
- **Test user/data:** Use `create_test_user.py` and test DBs
- **Testing:** No standard test runner found; tests may be in `test_router_load.py` or similar scripts
- **Environment:** Activate with `env/` or `activate_env.ps1` (Windows PowerShell)
- **Dependencies:** Install from `requirements.txt` (Python), `package.json` (Node for Tailwind UI)

## Patterns & Conventions
- **API Structure:** Each resource has a model, schema, and route module (e.g., `models/invoice.py`, `schemas/invoice.py`, `routes/invoice.py`)
- **Database:** Uses SQLite; models are in `models/`, migrations are script-based
- **Separation:** Business logic in models, validation in schemas, endpoints in routes
- **Static Assets:** Tailwind UI in `tailwind-working-project/` (separate from backend)
- **Naming:** Follows snake_case for files and variables

## Integration Points
- **Excel/CSV:** Import/export via scripts and endpoints (see `bank_transactions_export.xlsx`, `upload_coa.py`)
- **PDFs:** Generated invoices/receipts in `pdfs/`
- **Authentication:** `auth.py` and `routes/auth.py`

## Examples
- To add a new resource (e.g., `project`):
  1. Create `models/project.py`, `schemas/project.py`, `routes/project.py`
  2. Register the route in the main app
  3. Add DB migration script if needed
- To run locally:
  ```powershell
  .\activate_env.ps1
  python main.py
  ```

## Special Notes
- **UI errors** (e.g., "Failed to load invoices") may indicate backend API or DB issues
- **No standard test runner**: Tests are script-based; check for scripts named `test_*.py`
- **Tailwind UI** is managed separately in `tailwind-working-project/`

---
_Keep instructions concise and up-to-date. Update this file if project structure or workflows change._
