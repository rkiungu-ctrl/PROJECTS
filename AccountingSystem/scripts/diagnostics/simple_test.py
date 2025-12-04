#!/usr/bin/env python3
"""
Simple test server to isolate the issue
"""
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.purchase_invoice import PurchaseInvoice

app = FastAPI()

@app.get("/test")
def test_endpoint():
    return {"status": "OK", "message": "Server is working"}

@app.get("/test-db")  
def test_db(db: Session = Depends(get_db)):
    count = db.query(PurchaseInvoice).count()
    return {"status": "OK", "invoice_count": count}

if __name__ == "__main__":
    import uvicorn
    print("Starting simple test server...")
    try:
        uvicorn.run(app, host="127.0.0.1", port=8002, log_level="debug")
    except Exception as e:
        print(f"Server error: {e}")
        import traceback
        traceback.print_exc()
