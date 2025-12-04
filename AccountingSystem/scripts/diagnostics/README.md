# Diagnostics scripts

This folder contains short, troubleshooting scripts used during investigations. They are intended as utility helpers and have been moved here to keep the repository root clean.

Files
- `restore_data.py` — script to restore purchase invoice lines from `purchase_invoice_lines_backup` for a specific invoice id (used for targeted restoration).
- `simple_test.py` — minimal FastAPI app exposing `/test` and `/test-db` endpoints for basic sanity checks.
- `start_server.py` — convenience wrapper to start the main `uvicorn` server with reload; kept here for local debugging.

Guidelines
- These scripts are not part of the production API; use them only locally and with care.
- If you prefer these removed entirely, tell me and I will delete them.

Usage examples
Run `simple_test.py` locally:
```bash
python scripts/diagnostics/simple_test.py
```

Run the convenience server start (local development):
```bash
python scripts/diagnostics/start_server.py
```
