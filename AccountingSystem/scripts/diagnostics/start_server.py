#!/usr/bin/env python3
"""
Simple server startup script
"""
import sys
import os

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Now import and run
from main import app
import uvicorn

if __name__ == "__main__":
    print("🚀 Starting Accounting System API Server...")
    print(f"📂 Working directory: {os.getcwd()}")
    print(f"🐍 Python path: {sys.path[:3]}")
    
    uvicorn.run(
        "main:app",
        host="127.0.0.1", 
        port=8000,
        reload=True,
        reload_dirs=[".", "./routes", "./models", "./schemas"]
    )
