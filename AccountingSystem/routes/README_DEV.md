Recommendation: bank_transactions summary route

Currently `routes/bank_transaction.py` defines two summary endpoints:

- `GET /bank_transactions/summary` (declared at `@router.get("/summary")`) — a compact cash balance response
- `GET /bank_transactions/bank_transactions/summary` (declared at `@router.get("/bank_transactions/summary")`) — kept for compatibility

This double-prefixing is the source of confusion when mounting the router with an additional `prefix` in `main.py`.

Suggested cleanup:

1. Keep the router prefix as `prefix="/bank_transactions"` (already set on the router).
2. Rename the detailed per-account summary route to `@router.get("/summary")` (remove the extra `bank_transactions/` in the decorator).
3. In `main.py`, include the router without adding another prefix (i.e. `app.include_router(bank_transaction.router)`), not `app.include_router(..., prefix="/bank_transactions")`.

If you cannot change the route immediately, the frontend has been patched to tolerate both shapes (tries the double-prefixed path first and falls back to the single-prefixed path). Once you clean up the route the frontend fallback can be simplified.
